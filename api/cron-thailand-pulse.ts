import {
  generateThailandPulseSnapshot,
  getDefaultPulseInterestsFromEnv,
  normalizeInterests,
  persistPulseSnapshotToDb
} from './_lib/thailandPulsePipeline';

const defaultOwnerKey = process.env.AGENT_OWNER_KEY || 'default';

const parseBodyInterests = (req: any) => {
  if (!req?.body) return null;
  const body = req.body;
  if (Array.isArray(body?.interests)) return normalizeInterests(body.interests);
  if (typeof body?.interests === 'string') return normalizeInterests(body.interests);
  return null;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedKey =
    req.query?.key ||
    req.headers?.['x-cron-key'] ||
    req.headers?.authorization?.replace('Bearer ', '');
  if (cronSecret && providedKey !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const bodyInterests = parseBodyInterests(req);
    const interests = bodyInterests && bodyInterests.length > 0
      ? bodyInterests
      : getDefaultPulseInterestsFromEnv();
    const ownerKey = String(req.query?.ownerKey || req.headers?.['x-owner-key'] || defaultOwnerKey);

    const result = await generateThailandPulseSnapshot({
      interests,
      exaApiKey: process.env.EXA_API_KEY,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY
    });

    const persisted = await persistPulseSnapshotToDb(result.snapshot, ownerKey);
    if (!persisted.persisted && persisted.reason) {
      result.notes.push(`Persist failed: ${persisted.reason}`);
    }

    return res.status(200).json({
      success: persisted.persisted,
      ownerKey,
      runType: 'THAILAND_PULSE_12H',
      generatedAt: result.snapshot.generatedAt,
      dateKey: result.snapshot.dateKey,
      provider: result.snapshot.provider,
      categories: result.snapshot.categories.map((category) => ({
        name: category.name,
        articleCount: category.articles.length
      })),
      latencyMs: result.latencyMs,
      notes: result.notes
    });
  } catch (error: any) {
    console.error('[cron-thailand-pulse] failed', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
