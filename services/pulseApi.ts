// ─── pulseApi ─────────────────────────────────────────────────────────────────
// All network calls for World Pulse: fetch snapshot, history, source policy
// sync, feedback submission, and the combined load-with-fallback helper.

import {
  PulseArticle,
  PulseSourcePolicy,
  ThailandPulseSnapshot,
  sanitizeInterests,
  sanitizeDomains,
  normalizeSnapshot,
  persistPulseSnapshot,
  getPulseSnapshotHistory,
  getPulseFeedbackMap,
  persistPulseFeedbackMap,
  buildFallbackSnapshot,
  DEFAULT_PULSE_INTERESTS
} from './pulseStorage';

const PULSE_API_BASE = '/api/world-pulse';

const getCaptureKey = (): string => {
  try { return String((import.meta as any)?.env?.VITE_CAPTURE_API_SECRET || '').trim(); }
  catch { return ''; }
};

const pulseAuthHeaders = (json = false): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const key = getCaptureKey();
  if (key) headers['x-capture-key'] = key;
  return headers;
};

// ─── trimHistory helper (local) ───────────────────────────────────────────────

const MAX_HISTORY_DAYS = 7;

const sortSnapshots = (snapshots: ThailandPulseSnapshot[]) =>
  [...snapshots].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

const trimHistory = (snapshots: ThailandPulseSnapshot[]) => {
  const byDate = new Map<string, ThailandPulseSnapshot>();
  sortSnapshots(snapshots).forEach(s => { if (!byDate.has(s.dateKey)) byDate.set(s.dateKey, s); });
  return sortSnapshots(Array.from(byDate.values())).slice(0, MAX_HISTORY_DAYS);
};

// ─── API calls ────────────────────────────────────────────────────────────────

export interface PulseFetchOptions {
  ownerKey?: string;
  sourcePolicy?: PulseSourcePolicy;
}

export const fetchThailandPulseSnapshot = async (
  interests: string[],
  options: PulseFetchOptions = {}
): Promise<ThailandPulseSnapshot> => {
  const sanitized = sanitizeInterests(interests);
  const effectiveInterests = sanitized.length > 0 ? sanitized : [...DEFAULT_PULSE_INTERESTS];
  const params = new URLSearchParams({ interests: effectiveInterests.join(',') });
  if (options.ownerKey) params.set('ownerKey', options.ownerKey);
  if (options.sourcePolicy) {
    params.set('allowDomains', sanitizeDomains(options.sourcePolicy.allowDomains || []).join(','));
    params.set('denyDomains',  sanitizeDomains(options.sourcePolicy.denyDomains  || []).join(','));
  }
  const response = await fetch(`${PULSE_API_BASE}?${params.toString()}`, { headers: pulseAuthHeaders() });
  if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
  const payload = await response.json();
  const snapshot = payload?.snapshot as ThailandPulseSnapshot | undefined;
  if (!snapshot || !Array.isArray(snapshot.categories)) throw new Error('Invalid feed payload');
  return normalizeSnapshot(snapshot);
};

export const fetchPulseSnapshotHistoryFromServer = async (days = 7): Promise<ThailandPulseSnapshot[]> => {
  const safeDays = Math.max(1, Math.min(30, Math.floor(Number(days) || 7)));
  const response = await fetch(`${PULSE_API_BASE}?mode=history&days=${safeDays}`, { headers: pulseAuthHeaders() });
  if (!response.ok) throw new Error(`History request failed (${response.status})`);
  const payload = await response.json();
  const snapshots = payload?.snapshots;
  if (!Array.isArray(snapshots)) return [];
  return trimHistory((snapshots as ThailandPulseSnapshot[]).map(s => normalizeSnapshot(s)));
};

export const syncPulseHistoryFromServer = async (days = 7): Promise<ThailandPulseSnapshot[]> => {
  const local = getPulseSnapshotHistory();
  try {
    const remote = await fetchPulseSnapshotHistoryFromServer(days);
    if (remote.length === 0) return local;
    const merged = trimHistory([...remote, ...local]);
    // write back via storage helper (re-import to avoid circular)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'para-thailand-pulse-snapshots-v1',
        JSON.stringify(merged)
      );
    }
    return merged;
  } catch {
    return local;
  }
};

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
    denyDomains:  sanitizeDomains(policy.denyDomains  || [])
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
      denyDomains:  sanitizeDomains(policy.denyDomains  || [])
    })
  });
  return response.ok;
};

export const submitPulseFeedback = async (payload: {
  article: PulseArticle;
  relevant: boolean;
  ownerKey?: string;
  snapshotDate?: string;
}): Promise<boolean> => {
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

// ─── load with fallback ───────────────────────────────────────────────────────

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
    const fallback = buildFallbackSnapshot(sanitized.length ? sanitized : [...DEFAULT_PULSE_INTERESTS]);
    persistPulseSnapshot(fallback);
    return fallback;
  }
};
