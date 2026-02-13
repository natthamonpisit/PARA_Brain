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

export const generateThailandPulseSnapshot = async (opts: {
  interests: string[];
  exaApiKey?: string;
  firecrawlApiKey?: string;
}) => {
  const startedAt = Date.now();
  const notes: string[] = [];
  const interests = normalizeInterests(opts.interests);

  const categories = await Promise.all(
    interests.map(async (interest) => {
      const query = buildQuery(interest);

      try {
        const exaRows = opts.exaApiKey ? await fetchExa(query, opts.exaApiKey) : [];
        const rssRows = exaRows.length < 5 ? await fetchRss(query) : [];
        const merged = mergeByLink([...exaRows, ...rssRows]).slice(0, MAX_ITEMS_PER_CATEGORY);

        const shouldEnrich = Boolean(opts.firecrawlApiKey) && merged.length > 0;
        const enrichTargets = shouldEnrich ? merged.slice(0, FIRECRAWL_ENRICH_PER_CATEGORY) : [];
        const enrichedTop = shouldEnrich
          ? await Promise.all(enrichTargets.map((row) => enrichWithFirecrawl(row, opts.firecrawlApiKey!)))
          : enrichTargets;

        const byLink = new Map<string, ParsedItem>();
        merged.forEach((row) => byLink.set(normalizeLink(row.link), row));
        enrichedTop.forEach((row) => byLink.set(normalizeLink(row.link), row));

        const articles = Array.from(byLink.values())
          .slice(0, MAX_ITEMS_PER_CATEGORY)
          .map((row, index) => {
            const trustTier = trustTierFromSource(row.source);
            const words = row.title.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
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
              keywords: Array.from(new Set(words.map((word) => word.toLowerCase()))).slice(0, 8)
            };
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

  const generatedAt = new Date().toISOString();
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
    provider
  };

  return {
    snapshot,
    notes,
    latencyMs: Date.now() - startedAt
  };
};
