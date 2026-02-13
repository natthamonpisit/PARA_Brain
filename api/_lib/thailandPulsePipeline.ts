import { createClient } from '@supabase/supabase-js';

export type TrustTier = 'A' | 'B' | 'C' | 'UNKNOWN';
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
  trustTier: TrustTier;
  category: string;
  provider?: PulseProvider;
  citations?: PulseCitation[];
  keywords: string[];
  domain?: string;
  confidenceScore?: number;
  confidenceLabel?: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReasons?: string[];
  relevanceBias?: number;
}

export interface PulseSnapshot {
  id: string;
  dateKey: string;
  generatedAt: string;
  interests: string[];
  categories: Array<{
    name: string;
    query: string;
    articles: PulseArticle[];
  }>;
  trends: Array<{
    label: string;
    count: number;
    categories: string[];
  }>;
  sourceCoverage: Array<{
    source: string;
    tier: TrustTier;
    count: number;
  }>;
  notes: string[];
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

interface PulseFeedbackSignal {
  totalSignals: number;
  domainBias: Record<string, number>;
  categoryBias: Record<string, number>;
  keywordBias: Record<string, number>;
}

export interface PulseFeedbackInput {
  ownerKey: string;
  articleId: string;
  articleUrl?: string;
  source?: string;
  domain?: string;
  category?: string;
  keywords?: string[];
  relevant: boolean;
  snapshotDate?: string;
  confidenceScore?: number;
  metadata?: Record<string, any>;
}

interface ParsedItem {
  title: string;
  summary: string;
  link: string;
  publishedAt: string;
  source: string;
  sourceUrl?: string;
  provider: PulseProvider;
  citations?: PulseCitation[];
}

const MAX_ITEMS_PER_CATEGORY = 8;
const FIRECRAWL_ENRICH_PER_CATEGORY = 2;
const REQUEST_TIMEOUT_MS = 10000;
const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search';
const EXA_SEARCH_ENDPOINT = 'https://api.exa.ai/search';
const FIRECRAWL_SCRAPE_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';

export const DEFAULT_PULSE_INTERESTS = ['Technology', 'AI', 'Economic', 'Political', 'Business'];

const TRUST_PATTERNS: Array<{ pattern: RegExp; tier: TrustTier }> = [
  { pattern: /reuters|associated press|ap news|bbc|financial times|bloomberg|nikkei|the economist/i, tier: 'A' },
  { pattern: /thai pbs|bangkok post|the nation thailand|nationthailand|prachatai|thairath|matichon|the standard/i, tier: 'B' },
  { pattern: /blog|forum|opinion/i, tier: 'C' }
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'thailand',
  'thai',
  'news',
  'today',
  'update',
  'รัฐบาล',
  'ข่าว',
  'ล่าสุด'
]);

const TREND_KEYWORDS = [
  ['GLM-5', ['glm-5', 'glm5']],
  ['Open Source AI', ['open source ai', 'open-source ai', 'opensource ai', 'โอเพนซอร์ส']],
  ['กกต', ['กกต', 'election commission']],
  ['เลือกตั้ง', ['เลือกตั้ง', 'election']],
  ['Investment', ['investment', 'ลงทุน', 'หุ้น', 'set index']],
  ['Semiconductor', ['semiconductor', 'chip', 'gpu']],
  ['ASEAN', ['asean']],
  ['Bitcoin', ['bitcoin', 'btc', 'คริปโต', 'crypto']]
] as const;

const QUERY_PRESETS: Record<string, string> = {
  Technology: '(technology OR tech startup OR software) Thailand',
  AI: '(AI OR "artificial intelligence" OR "open source AI" OR GLM-5) Thailand',
  Economic: '(economy OR inflation OR GDP OR investment OR ตลาดทุน) Thailand',
  Political: '(การเมือง OR กกต OR เลือกตั้ง OR parliament OR corruption) Thailand',
  Business: '(business OR company earnings OR commerce OR startup funding) Thailand'
};

const TRUST_WEIGHT: Record<TrustTier, number> = {
  A: 1,
  B: 0.8,
  C: 0.58,
  UNKNOWN: 0.45
};

const decodeEntities = (value: string) =>
  value
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const stripHtml = (value: string) =>
  decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

const excerpt = (value: string, max = 280) => {
  const normalized = stripHtml(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
};

const extractTag = (block: string, tag: string) => {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  if (!match?.[1]) return '';
  return decodeEntities(match[1]);
};

const extractSource = (block: string) => {
  const match = block.match(/<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i);
  if (!match) {
    return { source: 'Unknown source', sourceUrl: undefined as string | undefined };
  }
  return {
    source: decodeEntities(match[2] || 'Unknown source'),
    sourceUrl: match[1] ? decodeEntities(match[1]) : undefined
  };
};

const normalizeLink = (link: string) => {
  try {
    const url = new URL(link);
    url.hash = '';
    return url.toString();
  } catch {
    return link;
  }
};

const toIsoTime = (value: string) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return new Date().toISOString();
  return new Date(time).toISOString();
};

const trustTierFromSource = (source: string): TrustTier => {
  const matched = TRUST_PATTERNS.find((item) => item.pattern.test(source));
  return matched ? matched.tier : 'UNKNOWN';
};

const domainFromUrl = (link: string) => {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown-source';
  }
};

const normalizeDomain = (value: string) => {
  let normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  normalized = normalized.replace(/^https?:\/\//, '').replace(/^www\./, '');
  normalized = normalized.split('/')[0];
  normalized = normalized.replace(/:\d+$/, '').replace(/\.+$/, '');
  return normalized;
};

export const normalizeDomains = (input: unknown): string[] => {
  const raw = Array.isArray(input) ? input.join(',') : String(input || '');
  const values = raw
    .split(',')
    .map((item) => normalizeDomain(item))
    .filter(Boolean);
  return Array.from(new Set(values)).slice(0, 80);
};

const isDomainMatch = (candidateDomain: string, rules: string[]) => {
  if (!candidateDomain || rules.length === 0) return false;
  return rules.some((rule) => candidateDomain === rule || candidateDomain.endsWith(`.${rule}`));
};

const toSourcePolicy = (policy?: Partial<PulseSourcePolicy> | null): PulseSourcePolicy => ({
  allowDomains: normalizeDomains(policy?.allowDomains || []),
  denyDomains: normalizeDomains(policy?.denyDomains || [])
});

const parseRss = (xml: string): ParsedItem[] => {
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return matches.map((block) => {
    const title = extractTag(block, 'title');
    const summary = excerpt(extractTag(block, 'description'));
    const link = normalizeLink(extractTag(block, 'link'));
    const publishedAt = toIsoTime(extractTag(block, 'pubDate'));
    const sourceMeta = extractSource(block);
    return {
      title,
      summary,
      link,
      publishedAt,
      source: sourceMeta.source,
      sourceUrl: sourceMeta.sourceUrl,
      provider: 'RSS' as PulseProvider,
      citations: [
        {
          label: 'RSS source',
          url: sourceMeta.sourceUrl || link,
          publisher: sourceMeta.source,
          publishedAt,
          retrievedAt: new Date().toISOString(),
          provider: 'RSS' as PulseProvider
        }
      ]
    };
  });
};

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchRss = async (query: string): Promise<ParsedItem[]> => {
  const url = `${GOOGLE_NEWS_BASE}?q=${encodeURIComponent(query)}&hl=th&gl=TH&ceid=TH:th`;
  const response = await fetchWithTimeout(url, {
    headers: { 'user-agent': 'Mozilla/5.0 PARA-Brain-Pulse/1.2' }
  });
  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }
  const text = await response.text();
  return parseRss(text);
};

const fetchExa = async (query: string, apiKey: string): Promise<ParsedItem[]> => {
  const response = await fetchWithTimeout(EXA_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: 12,
      text: true,
      useAutoprompt: false
    })
  });

  if (!response.ok) {
    throw new Error(`Exa search failed (${response.status})`);
  }

  const payload = await response.json();
  const rows = payload?.results || payload?.data?.results || [];
  return rows
    .map((row: any) => {
      const link = normalizeLink(String(row?.url || ''));
      const title = String(row?.title || '').trim();
      if (!title || !link) return null;
      const summary = excerpt(String(row?.summary || row?.text || ''), 320);
      const publishedAt = toIsoTime(String(row?.publishedDate || row?.published_date || row?.crawlDate || ''));
      const source = domainFromUrl(link);
      const sourceUrl = (() => {
        try {
          const url = new URL(link);
          return `${url.protocol}//${url.host}`;
        } catch {
          return undefined;
        }
      })();

      return {
        title,
        summary,
        link,
        publishedAt,
        source,
        sourceUrl,
        provider: 'EXA' as PulseProvider,
        citations: [
          {
            label: 'Exa discovery',
            url: link,
            publisher: source,
            publishedAt,
            retrievedAt: new Date().toISOString(),
            provider: 'EXA'
          }
        ]
      };
    })
    .filter(Boolean) as ParsedItem[];
};

const enrichWithFirecrawl = async (item: ParsedItem, apiKey: string): Promise<ParsedItem> => {
  try {
    const response = await fetchWithTimeout(FIRECRAWL_SCRAPE_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        url: item.link,
        formats: ['markdown'],
        onlyMainContent: true
      })
    });
    if (!response.ok) return item;

    const payload = await response.json();
    const data = payload?.data;
    if (!data) return item;

    const markdown = String(data?.markdown || '');
    const metadata = data?.metadata || {};
    const evidence = excerpt(markdown, 260);
    const nextSummary =
      excerpt(String(metadata?.description || ''), 260) ||
      (evidence.length > 0 ? evidence : item.summary);
    const nextTitle = String(metadata?.title || '').trim() || item.title;
    const retrievedAt = new Date().toISOString();

    return {
      ...item,
      title: nextTitle,
      summary: nextSummary,
      provider: item.provider === 'EXA' ? 'EXA+FIRECRAWL' : 'MIXED',
      citations: [
        ...(item.citations || []),
        {
          label: 'Firecrawl extraction',
          url: item.link,
          publisher: item.source,
          publishedAt: item.publishedAt,
          retrievedAt,
          provider: item.provider === 'EXA' ? 'EXA+FIRECRAWL' : 'MIXED',
          evidence
        }
      ]
    };
  } catch {
    return item;
  }
};

const mergeByLink = (rows: ParsedItem[]) => {
  const unique = new Map<string, ParsedItem>();
  rows.forEach((row) => {
    if (!row.title || !row.link) return;
    const key = normalizeLink(row.link);
    if (!unique.has(key)) {
      unique.set(key, row);
      return;
    }
    const current = unique.get(key)!;
    const mergedCitations = [...(current.citations || []), ...(row.citations || [])];
    unique.set(key, {
      ...current,
      summary: current.summary.length >= row.summary.length ? current.summary : row.summary,
      provider: current.provider === row.provider ? current.provider : 'MIXED',
      citations: mergedCitations
    });
  });
  return Array.from(unique.values());
};

const buildQuery = (interest: string) => {
  const key = Object.keys(QUERY_PRESETS).find(
    (candidate) => candidate.toLowerCase() === interest.toLowerCase()
  );
  return key ? QUERY_PRESETS[key] : `${interest} Thailand`;
};

const trendFromTitles = (
  rows: Array<{ title: string; category: string }>
): Array<{ label: string; count: number; categories: string[] }> => {
  const buckets = new Map<string, { count: number; categories: Set<string> }>();

  rows.forEach((row) => {
    const lower = row.title.toLowerCase();
    TREND_KEYWORDS.forEach(([label, aliases]) => {
      if (aliases.some((alias) => lower.includes(alias))) {
        const current = buckets.get(label) || { count: 0, categories: new Set<string>() };
        current.count += 1;
        current.categories.add(row.category);
        buckets.set(label, current);
      }
    });

    const terms: string[] = row.title.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
    terms.forEach((term) => {
      const normalized = term.toLowerCase();
      if (STOP_WORDS.has(normalized)) return;
      const label = term.toUpperCase() === term ? term : term[0].toUpperCase() + term.slice(1);
      const current = buckets.get(label) || { count: 0, categories: new Set<string>() };
      current.count += 1;
      current.categories.add(row.category);
      buckets.set(label, current);
    });
  });

  return Array.from(buckets.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      categories: Array.from(value.categories).slice(0, 3)
    }))
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 12);
};

const sourceCoverage = (
  rows: Array<{ source: string; trustTier: TrustTier }>
): Array<{ source: string; tier: TrustTier; count: number }> => {
  const buckets = new Map<string, { source: string; tier: TrustTier; count: number }>();
  rows.forEach((row) => {
    const key = `${row.source}::${row.trustTier}`;
    const current = buckets.get(key) || { source: row.source, tier: row.trustTier, count: 0 };
    current.count += 1;
    buckets.set(key, current);
  });
  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
    .slice(0, 12);
};

export const normalizeInterests = (input: unknown) => {
  const raw = Array.isArray(input) ? input.join(',') : String(input || '');
  const split = raw
    .split(',')
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const unique = Array.from(new Set(split));
  return unique.length > 0 ? unique.slice(0, 12) : [...DEFAULT_PULSE_INTERESTS];
};

export const getDefaultPulseInterestsFromEnv = () => {
  const raw = process.env.THAILAND_PULSE_DEFAULT_INTERESTS || DEFAULT_PULSE_INTERESTS.join(',');
  return normalizeInterests(raw);
};

export const getDefaultPulseSourcePolicyFromEnv = (): PulseSourcePolicy => {
  const allowDomains = normalizeDomains(process.env.THAILAND_PULSE_ALLOW_DOMAINS || '');
  const denyDomains = normalizeDomains(process.env.THAILAND_PULSE_DENY_DOMAINS || '');
  return {
    allowDomains,
    denyDomains
  };
};

const createBiasTable = (rows: Array<{ key: string; relevant: boolean }>) => {
  const counters = new Map<string, { positive: number; negative: number }>();
  rows.forEach((row) => {
    const key = String(row?.key || '').trim().toLowerCase();
    if (!key) return;
    const counter = counters.get(key) || { positive: 0, negative: 0 };
    if (row.relevant) counter.positive += 1;
    else counter.negative += 1;
    counters.set(key, counter);
  });
  const table: Record<string, number> = {};
  counters.forEach((counter, key) => {
    const total = counter.positive + counter.negative;
    if (total <= 0) return;
    table[key] = Number(((counter.positive - counter.negative) / total).toFixed(4));
  });
  return table;
};

const EMPTY_FEEDBACK_SIGNAL: PulseFeedbackSignal = {
  totalSignals: 0,
  domainBias: {},
  categoryBias: {},
  keywordBias: {}
};

const feedbackBiasForArticle = (article: PulseArticle, signal: PulseFeedbackSignal): number => {
  if (!signal || signal.totalSignals <= 0) return 0;
  const domainKey = normalizeDomain(article.domain || article.sourceUrl || article.url || '');
  const categoryKey = String(article.category || '').trim().toLowerCase();
  const domainBias = domainKey ? Number(signal.domainBias[domainKey] || 0) : 0;
  const categoryBias = categoryKey ? Number(signal.categoryBias[categoryKey] || 0) : 0;
  const keywordSample = (article.keywords || []).slice(0, 6);
  const keywordBiasValues = keywordSample
    .map((word) => Number(signal.keywordBias[String(word || '').toLowerCase()] || 0))
    .filter((value) => Number.isFinite(value));
  const keywordBias = keywordBiasValues.length
    ? keywordBiasValues.reduce((sum, value) => sum + value, 0) / keywordBiasValues.length
    : 0;
  const weighted = (domainBias * 0.55) + (categoryBias * 0.3) + (keywordBias * 0.15);
  return Math.max(-1, Math.min(1, Number(weighted.toFixed(4))));
};

const freshnessScore = (publishedAt: string, nowTimeMs: number): number => {
  const publishedMs = Date.parse(publishedAt);
  if (Number.isNaN(publishedMs)) return 0.4;
  const ageHours = Math.max(0, (nowTimeMs - publishedMs) / (1000 * 60 * 60));
  return Math.max(0, Math.min(1, Math.exp(-ageHours / 72)));
};

const corroborationScore = (article: PulseArticle): number => {
  const citationCount = Math.max(0, article.citations?.length || 0);
  const providerCount = new Set((article.citations || []).map((citation) => citation.provider || article.provider || 'RSS')).size;
  const normalized = (citationCount + providerCount) / 6;
  return Math.max(0, Math.min(1, normalized));
};

const confidenceLabelFromScore = (score: number): 'HIGH' | 'MEDIUM' | 'LOW' => {
  if (score >= 80) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  return 'LOW';
};

const withConfidenceScore = (article: PulseArticle, signal: PulseFeedbackSignal, nowIso: string): PulseArticle => {
  const trust = TRUST_WEIGHT[article.trustTier] || TRUST_WEIGHT.UNKNOWN;
  const freshness = freshnessScore(article.publishedAt, Date.parse(nowIso));
  const corroboration = corroborationScore(article);
  const relevanceBias = feedbackBiasForArticle(article, signal);
  const feedbackNormalized = (relevanceBias + 1) / 2;
  const score =
    (trust * 0.5) +
    (freshness * 0.22) +
    (corroboration * 0.18) +
    (feedbackNormalized * 0.1);
  const confidenceScore = Number((score * 100).toFixed(1));
  const reasons = [
    `Trust ${article.trustTier}`,
    `Freshness ${Math.round(freshness * 100)}%`,
    `Corroboration ${Math.round(corroboration * 100)}%`
  ];
  if (signal.totalSignals > 0) {
    const feedbackPct = Math.round(((relevanceBias + 1) / 2) * 100);
    reasons.push(`Feedback ${feedbackPct}%`);
  }
  return {
    ...article,
    confidenceScore,
    confidenceLabel: confidenceLabelFromScore(confidenceScore),
    confidenceReasons: reasons,
    relevanceBias
  };
};

const stableId = (prefix: string, link: string, index: number) =>
  `${prefix.toLowerCase().replace(/\s+/g, '-')}-${Buffer.from(`${link}-${index}`).toString('base64').slice(0, 12)}`;

const detectSnapshotProvider = (providers: PulseProvider[]): PulseProvider => {
  if (providers.length === 0) return 'FALLBACK';
  const unique = Array.from(new Set(providers));
  if (unique.length === 1) return unique[0];
  return unique.includes('EXA+FIRECRAWL') ? 'EXA+FIRECRAWL' : 'MIXED';
};

const createServiceDbClient = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

export const persistPulseSnapshotToDb = async (snapshot: PulseSnapshot, ownerKey: string) => {
  const db = createServiceDbClient();
  if (!db) {
    return { persisted: false, reason: 'missing_db_env' };
  }

  const payload = {
    owner_key: ownerKey,
    date_key: snapshot.dateKey,
    generated_at: snapshot.generatedAt,
    provider: snapshot.provider || 'RSS',
    interests: snapshot.interests || [],
    snapshot_json: snapshot,
    updated_at: new Date().toISOString()
  };

  const { error } = await db
    .from('pulse_snapshots')
    .upsert(payload, { onConflict: 'owner_key,date_key' });

  if (error) {
    return { persisted: false, reason: error.message };
  }
  return { persisted: true };
};

export const loadPulseSnapshotHistoryFromDb = async (ownerKey: string, days = 7) => {
  const db = createServiceDbClient();
  if (!db) return { snapshots: [] as PulseSnapshot[], source: 'none' as const };

  const safeDays = Math.max(1, Math.min(30, Number(days) || 7));
  const { data, error } = await db
    .from('pulse_snapshots')
    .select('snapshot_json,generated_at')
    .eq('owner_key', ownerKey)
    .order('generated_at', { ascending: false })
    .limit(safeDays);

  if (error) return { snapshots: [] as PulseSnapshot[], source: 'none' as const, error: error.message };

  const snapshots = (data || [])
    .map((row: any) => row.snapshot_json as PulseSnapshot)
    .filter(Boolean);

  return { snapshots, source: 'db' as const };
};

export const loadPulseSourcePolicyFromDb = async (ownerKey: string) => {
  const db = createServiceDbClient();
  if (!db) return { policy: null as PulseSourcePolicy | null, source: 'none' as const };
  const { data, error } = await db
    .from('pulse_source_preferences')
    .select('allow_domains,deny_domains')
    .eq('owner_key', ownerKey)
    .maybeSingle();
  if (error) return { policy: null as PulseSourcePolicy | null, source: 'none' as const, error: error.message };
  if (!data) return { policy: null as PulseSourcePolicy | null, source: 'db' as const };
  return {
    policy: toSourcePolicy({
      allowDomains: data.allow_domains || [],
      denyDomains: data.deny_domains || []
    }),
    source: 'db' as const
  };
};

export const savePulseSourcePolicyToDb = async (ownerKey: string, policy: PulseSourcePolicy) => {
  const db = createServiceDbClient();
  if (!db) return { persisted: false, reason: 'missing_db_env' };
  const normalized = toSourcePolicy(policy);
  const { error } = await db
    .from('pulse_source_preferences')
    .upsert(
      {
        owner_key: ownerKey,
        allow_domains: normalized.allowDomains,
        deny_domains: normalized.denyDomains,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'owner_key' }
    );
  if (error) return { persisted: false, reason: error.message };
  return { persisted: true, policy: normalized };
};

export const recordPulseFeedbackToDb = async (payload: PulseFeedbackInput) => {
  const db = createServiceDbClient();
  if (!db) return { persisted: false, reason: 'missing_db_env' };
  const row = {
    owner_key: payload.ownerKey,
    article_id: payload.articleId,
    article_url: payload.articleUrl || null,
    source: payload.source || null,
    domain: normalizeDomain(payload.domain || payload.articleUrl || ''),
    category: payload.category || null,
    keywords: Array.from(
      new Set(
        (payload.keywords || [])
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, 20),
    relevant: payload.relevant,
    snapshot_date: payload.snapshotDate || null,
    confidence_score: Number.isFinite(Number(payload.confidenceScore)) ? Number(payload.confidenceScore) : null,
    metadata: payload.metadata || {},
    updated_at: new Date().toISOString()
  };

  const { error } = await db
    .from('pulse_feedback')
    .upsert(row, { onConflict: 'owner_key,article_id' });
  if (error) return { persisted: false, reason: error.message };
  return { persisted: true };
};

export const loadPulseFeedbackSignalFromDb = async (ownerKey: string, days = 45): Promise<PulseFeedbackSignal> => {
  const db = createServiceDbClient();
  if (!db) return EMPTY_FEEDBACK_SIGNAL;

  const safeDays = Math.max(1, Math.min(365, Number(days) || 45));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('pulse_feedback')
    .select('relevant,domain,category,keywords,created_at')
    .eq('owner_key', ownerKey)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error || !Array.isArray(data) || data.length === 0) return EMPTY_FEEDBACK_SIGNAL;

  const domainRows: Array<{ key: string; relevant: boolean }> = [];
  const categoryRows: Array<{ key: string; relevant: boolean }> = [];
  const keywordRows: Array<{ key: string; relevant: boolean }> = [];

  data.forEach((row: any) => {
    const relevant = row?.relevant === true;
    const domain = normalizeDomain(String(row?.domain || ''));
    const category = String(row?.category || '').trim().toLowerCase();
    if (domain) domainRows.push({ key: domain, relevant });
    if (category) categoryRows.push({ key: category, relevant });
    if (Array.isArray(row?.keywords)) {
      row.keywords
        .map((value: any) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)
        .forEach((keyword: string) => keywordRows.push({ key: keyword, relevant }));
    }
  });

  return {
    totalSignals: data.length,
    domainBias: createBiasTable(domainRows),
    categoryBias: createBiasTable(categoryRows),
    keywordBias: createBiasTable(keywordRows)
  };
};

export const generateThailandPulseSnapshot = async (opts: {
  interests: string[];
  exaApiKey?: string;
  firecrawlApiKey?: string;
  sourcePolicy?: Partial<PulseSourcePolicy> | null;
  feedbackSignal?: PulseFeedbackSignal | null;
}) => {
  const startedAt = Date.now();
  const notes: string[] = [];
  const interests = normalizeInterests(opts.interests);
  const nowIso = new Date().toISOString();
  const feedbackSignal = opts.feedbackSignal || EMPTY_FEEDBACK_SIGNAL;
  const effectiveSourcePolicy = toSourcePolicy(opts.sourcePolicy || getDefaultPulseSourcePolicyFromEnv());

  if (effectiveSourcePolicy.allowDomains.length > 0) {
    notes.push(`Allow policy active (${effectiveSourcePolicy.allowDomains.length} domains).`);
  }
  if (effectiveSourcePolicy.denyDomains.length > 0) {
    notes.push(`Deny policy active (${effectiveSourcePolicy.denyDomains.length} domains).`);
  }
  if (feedbackSignal.totalSignals > 0) {
    notes.push(`Feedback signals applied (${feedbackSignal.totalSignals} votes).`);
  }

  const categories = await Promise.all(
    interests.map(async (interest) => {
      const query = buildQuery(interest);

      try {
        const exaRows = opts.exaApiKey ? await fetchExa(query, opts.exaApiKey) : [];
        const rssRows = exaRows.length < 5 ? await fetchRss(query) : [];
        const merged = mergeByLink([...exaRows, ...rssRows]).slice(0, MAX_ITEMS_PER_CATEGORY);
        const sourceFiltered = merged.filter((row) => {
          const domain = normalizeDomain(domainFromUrl(row.link));
          if (effectiveSourcePolicy.denyDomains.length > 0 && isDomainMatch(domain, effectiveSourcePolicy.denyDomains)) {
            return false;
          }
          if (effectiveSourcePolicy.allowDomains.length > 0 && !isDomainMatch(domain, effectiveSourcePolicy.allowDomains)) {
            return false;
          }
          return true;
        });
        if (merged.length > sourceFiltered.length) {
          notes.push(`${interest}: filtered ${merged.length - sourceFiltered.length} article(s) by source policy.`);
        }

        const shouldEnrich = Boolean(opts.firecrawlApiKey) && sourceFiltered.length > 0;
        const enrichTargets = shouldEnrich ? sourceFiltered.slice(0, FIRECRAWL_ENRICH_PER_CATEGORY) : [];
        const enrichedTop = shouldEnrich
          ? await Promise.all(enrichTargets.map((row) => enrichWithFirecrawl(row, opts.firecrawlApiKey!)))
          : enrichTargets;

        const byLink = new Map<string, ParsedItem>();
        sourceFiltered.forEach((row) => byLink.set(normalizeLink(row.link), row));
        enrichedTop.forEach((row) => byLink.set(normalizeLink(row.link), row));

        const articles = Array.from(byLink.values())
          .slice(0, MAX_ITEMS_PER_CATEGORY)
          .map((row, index) => {
            const trustTier = trustTierFromSource(row.source);
            const words = row.title.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
            const domain = normalizeDomain(domainFromUrl(row.link));
            return {
              id: stableId(interest, row.link, index),
              title: row.title,
              summary: row.summary,
              url: row.link,
              source: row.source,
              sourceUrl: row.sourceUrl,
              publishedAt: row.publishedAt,
              trustTier,
              category: interest,
              provider: row.provider,
              citations: row.citations || [],
              keywords: Array.from(new Set(words.map((word) => word.toLowerCase()))).slice(0, 8),
              domain
            };
          })
          .map((article) => withConfidenceScore(article, feedbackSignal, nowIso))
          .sort((a, b) => {
            const byScore = Number(b.confidenceScore || 0) - Number(a.confidenceScore || 0);
            if (byScore !== 0) return byScore;
            return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
          });

        if (articles.length === 0) {
          notes.push(`No results for ${interest}.`);
        }

        return { name: interest, query, articles };
      } catch (error: any) {
        notes.push(`Failed ${interest}: ${error?.message || 'unknown error'}`);
        return { name: interest, query, articles: [] };
      }
    })
  );

  const allArticles = categories.flatMap((category) => category.articles);
  const trends = trendFromTitles(
    allArticles.map((article) => ({ title: article.title, category: article.category }))
  );
  const coverage = sourceCoverage(
    allArticles.map((article) => ({
      source: article.source || 'Unknown source',
      trustTier: article.trustTier
    }))
  );

  if (!opts.exaApiKey) notes.push('EXA_API_KEY not set: using RSS-only discovery.');
  if (!opts.firecrawlApiKey) notes.push('FIRECRAWL_API_KEY not set: citation enrichment disabled.');

  const generatedAt = nowIso;
  const dateKey = generatedAt.slice(0, 10);
  const snapshotProviders = allArticles.map((article) => article.provider || 'RSS');
  const provider = detectSnapshotProvider(snapshotProviders);

  const snapshot: PulseSnapshot = {
    id: `pulse-${dateKey}-${Date.now().toString(36)}`,
    dateKey,
    generatedAt,
    interests,
    categories,
    trends,
    sourceCoverage: coverage,
    notes,
    provider,
    quality: {
      scoringVersion: 'confidence_v1',
      feedbackSignals: feedbackSignal.totalSignals,
      allowDomains: effectiveSourcePolicy.allowDomains,
      denyDomains: effectiveSourcePolicy.denyDomains
    }
  };

  return {
    snapshot,
    notes,
    latencyMs: Date.now() - startedAt
  };
};
