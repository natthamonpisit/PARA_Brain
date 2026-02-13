import {
  generateThailandPulseSnapshot,
  loadPulseSnapshotHistoryFromDb,
  normalizeInterests,
  persistPulseSnapshotToDb
} from './_lib/thailandPulsePipeline';

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mode = String(req.query?.mode || 'fetch').toLowerCase();
  const ownerKey = pickOwnerKey(req.query?.ownerKey);

  try {
    if (mode === 'history') {
      const days = parseDays(req.query?.days);
      const history = await loadPulseSnapshotHistoryFromDb(ownerKey, days);
      return res.status(200).json({
        success: true,
        ownerKey,
        days,
        source: history.source,
        snapshots: history.snapshots || [],
        error: history.error
      });
    }

    const interests = normalizeInterests(req.query?.interests);
    const result = await generateThailandPulseSnapshot({
      interests,
      exaApiKey: process.env.EXA_API_KEY,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY
    });

    const shouldPersist = String(req.query?.persist || 'true').toLowerCase() !== 'false';
    let persistResult: { persisted: boolean; reason?: string } | null = null;
    if (shouldPersist) {
      persistResult = await persistPulseSnapshotToDb(result.snapshot, ownerKey);
      if (!persistResult.persisted && persistResult.reason) {
        result.notes.push(`Persist skipped: ${persistResult.reason}`);
      }
    }

    return res.status(200).json({
      success: true,
      ownerKey,
      latencyMs: result.latencyMs,
      snapshot: result.snapshot,
      persisted: persistResult?.persisted ?? false
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal error'
    });
  }
}
