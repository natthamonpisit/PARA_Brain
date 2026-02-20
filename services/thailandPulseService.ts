// ─── services/thailandPulseService.ts ─────────────────────────────────────────
// Thin re-export shim — all logic lives in:
//   services/pulseStorage.ts  — types, constants, localStorage helpers
//   services/pulseApi.ts      — network fetch/post helpers

export type {
  PulseTrustTier,
  PulseProvider,
  PulseRegion,
  PulseCitation,
  PulseArticle,
  PulseCategorySnapshot,
  PulseSectionSnapshot,
  PulseTrendSignal,
  PulseSourceCoverage,
  ThailandPulseSnapshot,
  PulseSourcePolicy
} from './pulseStorage';

export {
  DEFAULT_PULSE_INTERESTS,
  sanitizeInterests,
  sanitizeDomains,
  normalizeSnapshot,
  getPulseSnapshotHistory,
  getLatestPulseSnapshot,
  persistPulseSnapshot,
  getPulseInterests,
  savePulseInterests,
  getPulseSourcePolicy,
  savePulseSourcePolicy,
  getPulseFeedbackMap,
  persistPulseFeedbackMap,
  buildFallbackSnapshot
} from './pulseStorage';

export type { PulseFetchOptions } from './pulseApi';

export {
  fetchThailandPulseSnapshot,
  fetchPulseSnapshotHistoryFromServer,
  syncPulseHistoryFromServer,
  fetchPulseSourcePolicyFromServer,
  savePulseSourcePolicyToServer,
  submitPulseFeedback,
  loadPulseSnapshotWithFallback
} from './pulseApi';
