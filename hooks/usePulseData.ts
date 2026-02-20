// ─── World Pulse — Data & State Hook ──────────────────────────────────────────
// All state management, data fetching, and derived values for ThailandPulseBoard.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PULSE_INTERESTS,
  PulseArticle,
  PulseCategorySnapshot,
  PulseRegion,
  PulseSectionSnapshot,
  PulseSourcePolicy,
  ThailandPulseSnapshot,
  fetchPulseSourcePolicyFromServer,
  getLatestPulseSnapshot,
  getPulseFeedbackMap,
  getPulseInterests,
  getPulseSourcePolicy,
  getPulseSnapshotHistory,
  loadPulseSnapshotWithFallback,
  savePulseSourcePolicy,
  savePulseSourcePolicyToServer,
  savePulseInterests,
  sanitizeDomains,
  sanitizeInterests,
  submitPulseFeedback,
  syncPulseHistoryFromServer
} from '../services/thailandPulseService';
import { regionLabel } from '../components/pulse/PulseHelpers';

export const categoryKeyOf = (category: PulseCategorySnapshot) => {
  if (category.id) return category.id;
  return `${category.region || 'TH'}::${category.name}`;
};

export function usePulseData(onSaveArticle: (article: PulseArticle) => Promise<void>) {
  const [interests, setInterests] = useState<string[]>(() => getPulseInterests());
  const [interestInput, setInterestInput] = useState('');
  const [sourcePolicy, setSourcePolicy] = useState<PulseSourcePolicy>(() => getPulseSourcePolicy());
  const [allowInput, setAllowInput] = useState('');
  const [denyInput, setDenyInput] = useState('');
  const [snapshot, setSnapshot] = useState<ThailandPulseSnapshot | null>(() => getLatestPulseSnapshot());
  const [history, setHistory] = useState<ThailandPulseSnapshot[]>(() => getPulseSnapshotHistory());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => getLatestPulseSnapshot()?.dateKey || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, boolean>>(() => getPulseFeedbackMap());
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'idle' | 'sending'>>({});
  const [errorText, setErrorText] = useState<string | null>(null);

  // ─── Data fetch ──────────────────────────────────────────────────────────

  const hydrateFromStorage = useCallback(() => {
    const snapshots = getPulseSnapshotHistory();
    setHistory(snapshots);
    if (!snapshots.length) return;
    const pick = snapshots.find((item) => item.dateKey === selectedDateKey) || snapshots[0];
    setSnapshot(pick);
    setSelectedDateKey(pick.dateKey);
  }, [selectedDateKey]);

  const fetchLive = useCallback(
    async (mode: 'initial' | 'refresh', targetInterests?: string[], targetPolicy?: PulseSourcePolicy) => {
      setErrorText(null);
      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);
      try {
        const next = await loadPulseSnapshotWithFallback(targetInterests || interests, {
          sourcePolicy: targetPolicy || sourcePolicy
        });
        setSnapshot(next);
        setSelectedDateKey(next.dateKey);
      } catch (error: any) {
        setErrorText(error?.message || 'Unable to refresh pulse.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        hydrateFromStorage();
      }
    },
    [hydrateFromStorage, interests, sourcePolicy]
  );

  useEffect(() => {
    hydrateFromStorage();
    if (!getLatestPulseSnapshot()) void fetchLive('initial');
  }, [fetchLive, hydrateFromStorage]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const remotePolicy = await fetchPulseSourcePolicyFromServer();
      if (active && remotePolicy) {
        setSourcePolicy(remotePolicy);
        savePulseSourcePolicy(remotePolicy);
      }
      const synced = await syncPulseHistoryFromServer(7);
      if (!active || synced.length === 0) return;
      setHistory(synced);
      const preferred = synced.find((item) => item.dateKey === selectedDateKey) || synced[0];
      setSnapshot(preferred);
      if (!selectedDateKey || !synced.some((item) => item.dateKey === selectedDateKey)) {
        setSelectedDateKey(preferred.dateKey);
      }
    })();
    return () => { active = false; };
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const currentSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (!selectedDateKey) return snapshot;
    return history.find((item) => item.dateKey === selectedDateKey) || snapshot;
  }, [history, selectedDateKey, snapshot]);

  const totalArticles = useMemo(() => {
    if (!currentSnapshot) return 0;
    return currentSnapshot.categories.reduce((sum, c) => sum + c.articles.length, 0);
  }, [currentSnapshot]);

  const isViewingHistory = Boolean(currentSnapshot && selectedDateKey && currentSnapshot.dateKey !== history[0]?.dateKey);

  const sectionedCategories = useMemo((): PulseSectionSnapshot[] => {
    if (!currentSnapshot) return [];
    const rawSections = Array.isArray(currentSnapshot.sections) && currentSnapshot.sections.length > 0
      ? currentSnapshot.sections
      : [{ id: 'TH' as PulseRegion, label: regionLabel.TH, categories: currentSnapshot.categories }];
    const map = new Map<PulseRegion, PulseSectionSnapshot>();
    rawSections.forEach((section) => {
      const id = section.id === 'GLOBAL' ? 'GLOBAL' : 'TH';
      map.set(id, {
        id,
        label: section.label || regionLabel[id],
        categories: [...(section.categories || [])].sort((a, b) => b.articles.length - a.articles.length)
      });
    });
    (['TH', 'GLOBAL'] as PulseRegion[]).forEach((id) => {
      if (!map.has(id)) map.set(id, { id, label: regionLabel[id], categories: [] });
    });
    return (['TH', 'GLOBAL'] as PulseRegion[]).map((id) => map.get(id)!);
  }, [currentSnapshot]);

  const globalStoryCount = useMemo(() => {
    const s = sectionedCategories.find((s) => s.id === 'GLOBAL');
    return s ? s.categories.reduce((sum, c) => sum + c.articles.length, 0) : 0;
  }, [sectionedCategories]);

  const activeCategory = useMemo(() => {
    if (!activeCategoryKey) return null;
    for (const section of sectionedCategories) {
      const category = section.categories.find((c) => categoryKeyOf(c) === activeCategoryKey);
      if (category) return { sectionId: section.id, sectionLabel: section.label, category };
    }
    return null;
  }, [activeCategoryKey, sectionedCategories]);

  const activeArticle = useMemo(
    () => activeCategory && activeArticleId
      ? activeCategory.category.articles.find((a) => a.id === activeArticleId) || null
      : null,
    [activeArticleId, activeCategory]
  );

  const viewMode: 'overview' | 'category' | 'article' = activeArticle ? 'article' : activeCategory ? 'category' : 'overview';

  // ─── Effects to clean stale selections ───────────────────────────────────

  useEffect(() => {
    if (!activeCategoryKey) return;
    const exists = sectionedCategories.some((s) => s.categories.some((c) => categoryKeyOf(c) === activeCategoryKey));
    if (!exists) { setActiveCategoryKey(null); setActiveArticleId(null); }
  }, [activeCategoryKey, sectionedCategories]);

  useEffect(() => {
    if (!activeArticleId) return;
    if (!activeCategory || !activeCategory.category.articles.some((a) => a.id === activeArticleId)) {
      setActiveArticleId(null);
    }
  }, [activeArticleId, activeCategory]);

  // ─── Navigation handlers ──────────────────────────────────────────────────

  const openCategory = (category: PulseCategorySnapshot) => {
    setActiveCategoryKey(categoryKeyOf(category));
    setActiveArticleId(null);
  };

  const handleBack = () => {
    if (viewMode === 'article') { setActiveArticleId(null); return; }
    setActiveCategoryKey(null);
  };

  // ─── Interest handlers ────────────────────────────────────────────────────

  const handleAddInterest = () => {
    const next = sanitizeInterests([...interests, interestInput]);
    if (next.length === interests.length) { setInterestInput(''); return; }
    setInterests(next);
    savePulseInterests(next);
    setInterestInput('');
    void fetchLive('refresh', next);
  };

  const handleRemoveInterest = (value: string) => {
    const next = interests.filter((i) => i !== value);
    const effective = next.length > 0 ? next : [...DEFAULT_PULSE_INTERESTS];
    setInterests(effective);
    savePulseInterests(effective);
    void fetchLive('refresh', effective);
  };

  // ─── Source policy handlers ───────────────────────────────────────────────

  const applySourcePolicy = (nextPolicy: PulseSourcePolicy) => {
    const sanitized = {
      allowDomains: sanitizeDomains(nextPolicy.allowDomains || []),
      denyDomains: sanitizeDomains(nextPolicy.denyDomains || [])
    };
    setSourcePolicy(sanitized);
    savePulseSourcePolicy(sanitized);
    void savePulseSourcePolicyToServer(sanitized);
    void fetchLive('refresh', interests, sanitized);
  };

  const handleAddAllowDomain = () => {
    const next = sanitizeDomains([...sourcePolicy.allowDomains, allowInput]);
    setAllowInput('');
    if (next.length === sourcePolicy.allowDomains.length) return;
    applySourcePolicy({ ...sourcePolicy, allowDomains: next });
  };

  const handleAddDenyDomain = () => {
    const next = sanitizeDomains([...sourcePolicy.denyDomains, denyInput]);
    setDenyInput('');
    if (next.length === sourcePolicy.denyDomains.length) return;
    applySourcePolicy({ ...sourcePolicy, denyDomains: next });
  };

  const handleRemoveAllowDomain = (domain: string) =>
    applySourcePolicy({ ...sourcePolicy, allowDomains: sourcePolicy.allowDomains.filter((d) => d !== domain) });

  const handleRemoveDenyDomain = (domain: string) =>
    applySourcePolicy({ ...sourcePolicy, denyDomains: sourcePolicy.denyDomains.filter((d) => d !== domain) });

  // ─── Feedback / save ─────────────────────────────────────────────────────

  const handleFeedback = async (article: PulseArticle, relevant: boolean) => {
    setFeedbackStatus((prev) => ({ ...prev, [article.id]: 'sending' }));
    setFeedbackMap((prev) => ({ ...prev, [article.id]: relevant }));
    try {
      const ok = await submitPulseFeedback({ article, relevant, snapshotDate: currentSnapshot?.dateKey });
      if (!ok) setErrorText('Feedback saved locally, but server sync failed.');
      else if (!isViewingHistory) void fetchLive('refresh');
    } catch {
      setErrorText('Feedback saved locally, but server sync failed.');
    } finally {
      setFeedbackStatus((prev) => ({ ...prev, [article.id]: 'idle' }));
    }
  };

  const handleSaveArticle = async (article: PulseArticle) => {
    setSaveStatus((prev) => ({ ...prev, [article.id]: 'saving' }));
    try {
      await onSaveArticle(article);
      setSaveStatus((prev) => ({ ...prev, [article.id]: 'saved' }));
    } catch {
      setSaveStatus((prev) => ({ ...prev, [article.id]: 'error' }));
    }
  };

  return {
    // state
    interests, interestInput, setInterestInput,
    sourcePolicy, allowInput, setAllowInput, denyInput, setDenyInput,
    isLoading, isRefreshing, isConfigExpanded, setIsConfigExpanded,
    saveStatus, feedbackMap, feedbackStatus, errorText,
    // derived
    currentSnapshot, totalArticles, isViewingHistory,
    sectionedCategories, globalStoryCount,
    activeCategory, activeArticle, activeCategoryKey, activeArticleId,
    viewMode,
    history, selectedDateKey, setSelectedDateKey,
    // handlers
    fetchLive,
    openCategory, handleBack,
    handleAddInterest, handleRemoveInterest,
    handleAddAllowDomain, handleAddDenyDomain,
    handleRemoveAllowDomain, handleRemoveDenyDomain,
    applySourcePolicy,
    handleFeedback, handleSaveArticle,
    setActiveCategoryKey, setActiveArticleId,
  };
}
