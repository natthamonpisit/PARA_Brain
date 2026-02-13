import {
  generateThailandPulseSnapshot,
  getDefaultPulseSourcePolicyFromEnv,
  getDefaultPulseInterestsFromEnv,
  loadPulseFeedbackSignalFromDb,
  loadPulseSourcePolicyFromDb,
  normalizeInterests,
  persistPulseSnapshotToDb
} from './_lib/thailandPulsePipeline';
import { finalizeApiObservation, startApiObservation } from './_lib/observability';

const defaultOwnerKey = process.env.AGENT_OWNER_KEY || 'default';

const parseBodyInterests = (req: any) => {
  if (!req?.body) return null;
  const body = req.body;
  if (Array.isArray(body?.interests)) return normalizeInterests(body.interests);
  if (typeof body?.interests === 'string') return normalizeInterests(body.interests);
  return null;
};

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/cron-thailand-pulse', { source: 'CRON' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'POST' && req.method !== 'GET') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedKey =
    req.query?.key ||
    req.headers?.['x-cron-key'] ||
    req.headers?.authorization?.replace('Bearer ', '');
  if (cronSecret && providedKey !== cronSecret) {
    return respond(401, { error: 'Unauthorized' }, { reason: 'auth_failed' });
  }

  try {
    const bodyInterests = parseBodyInterests(req);
    const interests = bodyInterests && bodyInterests.length > 0
      ? bodyInterests
      : getDefaultPulseInterestsFromEnv();
    const ownerKey = String(req.query?.ownerKey || req.headers?.['x-owner-key'] || defaultOwnerKey);
    const policyFromDb = await loadPulseSourcePolicyFromDb(ownerKey);
    const sourcePolicy = policyFromDb.policy || getDefaultPulseSourcePolicyFromEnv();
    const feedbackSignal = await loadPulseFeedbackSignalFromDb(ownerKey, 45);

    const result = await generateThailandPulseSnapshot({
      interests,
      exaApiKey: process.env.EXA_API_KEY,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      sourcePolicy,
      feedbackSignal
    });

    const persisted = await persistPulseSnapshotToDb(result.snapshot, ownerKey);
    if (!persisted.persisted && persisted.reason) {
      result.notes.push(`Persist failed: ${persisted.reason}`);
    }

    return respond(200, {
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
      feedbackSignals: feedbackSignal.totalSignals,
      sourcePolicy,
      notes: result.notes
    }, {
      runType: 'THAILAND_PULSE_12H',
      provider: result.snapshot.provider,
      latencyMs: result.latencyMs,
      persisted: persisted.persisted
    });
  } catch (error: any) {
    console.error('[cron-thailand-pulse] failed', error);
    return respond(500, { error: error?.message || 'Internal error' }, { reason: 'exception', error: error?.message || 'unknown' });
  }
}
