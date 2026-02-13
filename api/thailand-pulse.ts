import {
  generateThailandPulseSnapshot,
  getDefaultPulseSourcePolicyFromEnv,
  loadPulseFeedbackSignalFromDb,
  loadPulseSnapshotHistoryFromDb,
  loadPulseSourcePolicyFromDb,
  normalizeDomains,
  normalizeInterests,
  persistPulseSnapshotToDb,
  recordPulseFeedbackToDb,
  savePulseSourcePolicyToDb
} from './_lib/thailandPulsePipeline';
import { finalizeApiObservation, startApiObservation } from './_lib/observability';

const defaultOwnerKey = process.env.AGENT_OWNER_KEY || 'default';

const parseDays = (value: unknown) => {
  const n = Number(value);
  if (Number.isNaN(n)) return 7;
  return Math.max(1, Math.min(30, Math.floor(n)));
};

const pickOwnerKey = (value: unknown) => {
  const owner = String(value || '').trim();
  return owner || defaultOwnerKey;
};

const parseDomainQuery = (value: unknown): string[] | null => {
  if (value === undefined || value === null) return null;
  return normalizeDomains(value);
};

const resolveSourcePolicy = async (ownerKey: string, query: any) => {
  const envPolicy = getDefaultPulseSourcePolicyFromEnv();
  const dbPolicy = await loadPulseSourcePolicyFromDb(ownerKey);
  const allowOverride = parseDomainQuery(query?.allowDomains);
  const denyOverride = parseDomainQuery(query?.denyDomains);

  const baseAllow = dbPolicy.policy?.allowDomains ?? envPolicy.allowDomains;
  const baseDeny = dbPolicy.policy?.denyDomains ?? envPolicy.denyDomains;
  return {
    allowDomains: allowOverride !== null ? allowOverride : baseAllow,
    denyDomains: denyOverride !== null ? denyOverride : baseDeny
  };
};

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/thailand-pulse', { source: 'THAILAND_PULSE' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'GET' && req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  const mode = String(req.query?.mode || req.body?.mode || 'fetch').toLowerCase();
  const ownerKey = pickOwnerKey(req.query?.ownerKey || req.body?.ownerKey);

  try {
    if (req.method === 'POST') {
      if (mode === 'feedback') {
        const relevant = req.body?.relevant;
        const articleId = String(req.body?.articleId || '').trim();
        if (!articleId || typeof relevant !== 'boolean') {
          return respond(400, { error: 'articleId and relevant(boolean) are required' }, { reason: 'invalid_feedback_payload' });
        }

        const saved = await recordPulseFeedbackToDb({
          ownerKey,
          articleId,
          articleUrl: req.body?.articleUrl,
          source: req.body?.source,
          domain: req.body?.domain,
          category: req.body?.category,
          keywords: Array.isArray(req.body?.keywords) ? req.body.keywords : [],
          relevant,
          snapshotDate: req.body?.snapshotDate,
          confidenceScore: req.body?.confidenceScore,
          metadata: typeof req.body?.metadata === 'object' && req.body?.metadata ? req.body.metadata : {}
        });

        if (!saved.persisted) {
          return respond(500, { success: false, error: saved.reason || 'Failed to save feedback' }, { reason: 'feedback_save_failed' });
        }
        return respond(200, { success: true, ownerKey, mode: 'feedback' }, { mode: 'feedback', relevant });
      }

      if (mode === 'policy' || mode === 'source-policy') {
        const allowDomains = normalizeDomains(req.body?.allowDomains || []);
        const denyDomains = normalizeDomains(req.body?.denyDomains || []);
        const saved = await savePulseSourcePolicyToDb(ownerKey, { allowDomains, denyDomains });
        if (!saved.persisted) {
          return respond(500, { success: false, error: saved.reason || 'Failed to save source policy' }, { reason: 'policy_save_failed' });
        }
        return respond(200, {
          success: true,
          ownerKey,
          mode: 'policy',
          policy: saved.policy || { allowDomains, denyDomains }
        }, { mode: 'policy_save' });
      }

      return respond(400, { error: `Unsupported POST mode: ${mode}` }, { reason: 'unsupported_post_mode', mode });
    }

    if (mode === 'history') {
      const days = parseDays(req.query?.days);
      const history = await loadPulseSnapshotHistoryFromDb(ownerKey, days);
      return respond(200, {
        success: true,
        ownerKey,
        days,
        source: history.source,
        snapshots: history.snapshots || [],
        error: history.error
      }, { mode: 'history', days });
    }

    if (mode === 'policy') {
      const policy = await resolveSourcePolicy(ownerKey, req.query);
      return respond(200, {
        success: true,
        ownerKey,
        mode: 'policy',
        policy
      }, { mode: 'policy_get' });
    }

    const interests = normalizeInterests(req.query?.interests);
    const sourcePolicy = await resolveSourcePolicy(ownerKey, req.query);
    const feedbackSignal = await loadPulseFeedbackSignalFromDb(ownerKey, 45);
    const result = await generateThailandPulseSnapshot({
      interests,
      exaApiKey: process.env.EXA_API_KEY,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      sourcePolicy,
      feedbackSignal
    });

    const shouldPersist = String(req.query?.persist || 'true').toLowerCase() !== 'false';
    let persistResult: { persisted: boolean; reason?: string } | null = null;
    if (shouldPersist) {
      persistResult = await persistPulseSnapshotToDb(result.snapshot, ownerKey);
      if (!persistResult.persisted && persistResult.reason) {
        result.notes.push(`Persist skipped: ${persistResult.reason}`);
      }
    }

    return respond(200, {
      success: true,
      ownerKey,
      latencyMs: result.latencyMs,
      snapshot: result.snapshot,
      sourcePolicy,
      feedbackSignals: feedbackSignal.totalSignals,
      persisted: persistResult?.persisted ?? false
    }, {
      mode: 'fetch',
      provider: result.snapshot.provider,
      latencyMs: result.latencyMs,
      feedbackSignals: feedbackSignal.totalSignals
    });
  } catch (error: any) {
    return respond(500, {
      success: false,
      error: error?.message || 'Internal error'
    }, { reason: 'exception', error: error?.message || 'unknown', mode });
  }
}
