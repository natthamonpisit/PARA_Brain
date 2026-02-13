type TrustTier = 'A' | 'B' | 'C' | 'UNKNOWN';

interface ParsedFeedItem {
  title: string;
  summary: string;
  link: string;
  publishedAt: string;
  source: string;
  sourceUrl?: string;
}

const MAX_ITEMS_PER_CATEGORY = 8;
const REQUEST_TIMEOUT_MS = 9000;
const DEFAULT_INTERESTS = ['Technology', 'AI', 'Economic', 'Political', 'Business'];

const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search';

const TRUST_PATTERNS: Array<{
  pattern: RegExp;
  tier: TrustTier;
}> = [
  { pattern: /reuters|associated press|ap news|bbc|financial times|bloomberg|nikkei|the economist/i, tier: 'A' },
  { pattern: /thai pbs|bangkok post|the nation thailand|prachatai|thairath|matichon|the standard/i, tier: 'B' },
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

const parseRss = (xml: string): ParsedFeedItem[] => {
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return matches.map((block) => {
    const title = extractTag(block, 'title');
    const summary = extractTag(block, 'description');
    const link = normalizeLink(extractTag(block, 'link'));
    const publishedAt = toIsoTime(extractTag(block, 'pubDate'));
    const sourceMeta = extractSource(block);
    return {
      title,
      summary,
      link,
      publishedAt,
      source: sourceMeta.source,
      sourceUrl: sourceMeta.sourceUrl
    };
  });
};

const fetchRss = async (query: string): Promise<ParsedFeedItem[]> => {
  const url = `${GOOGLE_NEWS_BASE}?q=${encodeURIComponent(query)}&hl=th&gl=TH&ceid=TH:th`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 PARA-Brain-Pulse/1.0'
      }
    });
    if (!response.ok) {
      throw new Error(`Feed request failed (${response.status})`);
    }
    const text = await response.text();
    return parseRss(text);
  } finally {
    clearTimeout(timeout);
  }
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

    const terms = row.title.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
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

const normalizeInterests = (input: unknown) => {
  const raw = Array.isArray(input) ? input.join(',') : String(input || '');
  const split = raw
    .split(',')
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const unique = Array.from(new Set(split));
  return unique.length > 0 ? unique.slice(0, 12) : [...DEFAULT_INTERESTS];
};

const stableId = (prefix: string, link: string, index: number) =>
  `${prefix.toLowerCase().replace(/\s+/g, '-')}-${Buffer.from(`${link}-${index}`).toString('base64').slice(0, 12)}`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startedAt = Date.now();
  const notes: string[] = [];

  try {
    const interests = normalizeInterests(req.query?.interests);
    const categories = await Promise.all(
      interests.map(async (interest) => {
        const query = buildQuery(interest);
        try {
          const rows = await fetchRss(query);
          const unique = new Map<string, ParsedFeedItem>();
          rows.forEach((row) => {
            if (!row.title || !row.link) return;
            const key = normalizeLink(row.link);
            if (!unique.has(key)) unique.set(key, row);
          });

          const articles = Array.from(unique.values())
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
                keywords: Array.from(new Set(words.map((word) => word.toLowerCase()))).slice(0, 8)
              };
            });

          if (articles.length === 0) {
            notes.push(`No results for ${interest}.`);
          }

          return {
            name: interest,
            query,
            articles
          };
        } catch (error: any) {
          notes.push(`Failed ${interest}: ${error?.message || 'unknown error'}`);
          return {
            name: interest,
            query,
            articles: []
          };
        }
      })
    );

    const allArticles = categories.flatMap((category) => category.articles);
    const trends = trendFromTitles(allArticles.map((article) => ({ title: article.title, category: article.category })));
    const coverage = sourceCoverage(
      allArticles.map((article) => ({
        source: article.source || 'Unknown source',
        trustTier: article.trustTier
      }))
    );

    const generatedAt = new Date().toISOString();
    const dateKey = generatedAt.slice(0, 10);
    const snapshot = {
      id: `pulse-${dateKey}-${Date.now().toString(36)}`,
      dateKey,
      generatedAt,
      interests,
      categories,
      trends,
      sourceCoverage: coverage,
      notes
    };

    return res.status(200).json({
      success: true,
      latencyMs: Date.now() - startedAt,
      snapshot
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal error',
      notes
    });
  }
}
