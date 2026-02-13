import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgePlus,
  BookMarked,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  TrendingUp
} from 'lucide-react';
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

interface ThailandPulseBoardProps {
  onSaveArticle: (article: PulseArticle) => Promise<void>;
}

const HelpTip: React.FC<{ th: string; en: string; className?: string }> = ({ th, en, className }) => (
  <span className={`group relative inline-flex shrink-0 ${className || ''}`}>
    <button
      type="button"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/50 bg-slate-900/90 text-[10px] font-bold text-cyan-100 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/35"
      aria-label={`Help: ${en}`}
      title={`TH: ${th}\nEN: ${en}`}
    >
      ?
    </button>
    <span className="pointer-events-none absolute right-0 top-5 z-30 hidden w-72 rounded-md border border-slate-600 bg-slate-900/95 p-2 text-[11px] leading-relaxed text-slate-100 shadow-xl group-hover:block group-focus-within:block">
      <span className="block">
        <span className="font-semibold text-cyan-200">TH:</span> {th}
      </span>
      <span className="mt-1 block">
        <span className="font-semibold text-cyan-200">EN:</span> {en}
      </span>
    </span>
  </span>
);

const formatRelativeTime = (iso: string) => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '-';
  const diffMs = Date.now() - time;
  const minutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const toDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const tierTone: Record<string, string> = {
  A: 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100',
  B: 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100',
  C: 'border-amber-300/35 bg-amber-500/10 text-amber-100',
  UNKNOWN: 'border-slate-500/50 bg-slate-700/40 text-slate-100'
};

const providerTone: Record<string, string> = {
  RSS: 'border-slate-600 bg-slate-800/80 text-slate-200',
  EXA: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100',
  'EXA+FIRECRAWL': 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
  MIXED: 'border-violet-400/35 bg-violet-500/10 text-violet-100',
  FALLBACK: 'border-amber-400/35 bg-amber-500/10 text-amber-100'
};

const confidenceTone: Record<string, string> = {
  HIGH: 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100',
  MEDIUM: 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100',
  LOW: 'border-amber-300/40 bg-amber-500/15 text-amber-100'
};

const regionLabel: Record<PulseRegion, string> = {
  TH: 'Thailand',
  GLOBAL: 'Global'
};

const categoryKeyOf = (category: PulseCategorySnapshot) => {
  if (category.id) return category.id;
  return `${category.region || 'TH'}::${category.name}`;
};

export const ThailandPulseBoard: React.FC<ThailandPulseBoardProps> = ({ onSaveArticle }) => {
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

  const hydrateFromStorage = useCallback(() => {
    const snapshots = getPulseSnapshotHistory();
    setHistory(snapshots);
    if (!snapshots.length) return;
    const pick =
      snapshots.find((item) => item.dateKey === selectedDateKey) ||
      snapshots[0];
    setSnapshot(pick);
    setSelectedDateKey(pick.dateKey);
  }, [selectedDateKey]);

  const fetchLive = useCallback(
    async (mode: 'initial' | 'refresh', targetInterests?: string[], targetPolicy?: PulseSourcePolicy) => {
      setErrorText(null);
      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);
      try {
        const effectiveInterests = targetInterests || interests;
        const effectivePolicy = targetPolicy || sourcePolicy;
        const next = await loadPulseSnapshotWithFallback(effectiveInterests, {
          sourcePolicy: effectivePolicy
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
    if (!getLatestPulseSnapshot()) {
      void fetchLive('initial');
    }
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
    return () => {
      active = false;
    };
  }, []);

  const currentSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (!selectedDateKey) return snapshot;
    return history.find((item) => item.dateKey === selectedDateKey) || snapshot;
  }, [history, selectedDateKey, snapshot]);

  const totalArticles = useMemo(() => {
    if (!currentSnapshot) return 0;
    return currentSnapshot.categories.reduce((sum, category) => sum + category.articles.length, 0);
  }, [currentSnapshot]);

  const isViewingHistory = Boolean(currentSnapshot && selectedDateKey && currentSnapshot.dateKey !== history[0]?.dateKey);
  const sectionedCategories = useMemo(() => {
    if (!currentSnapshot) return [] as PulseSectionSnapshot[];
    const rawSections = Array.isArray(currentSnapshot.sections) && currentSnapshot.sections.length > 0
      ? currentSnapshot.sections
      : [
          {
            id: 'TH' as PulseRegion,
            label: regionLabel.TH,
            categories: currentSnapshot.categories
          }
        ];
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
      if (!map.has(id)) {
        map.set(id, {
          id,
          label: regionLabel[id],
          categories: []
        });
      }
    });
    return (['TH', 'GLOBAL'] as PulseRegion[]).map((id) => map.get(id)!);
  }, [currentSnapshot]);
  const activeCategory = useMemo(() => {
    if (!activeCategoryKey) return null;
    for (const section of sectionedCategories) {
      const category = section.categories.find((item) => categoryKeyOf(item) === activeCategoryKey);
      if (category) {
        return {
          sectionId: section.id,
          sectionLabel: section.label,
          category
        };
      }
    }
    return null;
  }, [activeCategoryKey, sectionedCategories]);
  const activeArticle = useMemo(
    () =>
      activeCategory && activeArticleId
        ? activeCategory.category.articles.find((article) => article.id === activeArticleId) || null
        : null,
    [activeArticleId, activeCategory]
  );
  const viewMode: 'overview' | 'category' | 'article' = activeArticle
    ? 'article'
    : activeCategory
      ? 'category'
      : 'overview';

  useEffect(() => {
    if (!activeCategoryKey) return;
    const exists = sectionedCategories.some((section) =>
      section.categories.some((category) => categoryKeyOf(category) === activeCategoryKey)
    );
    if (!exists) {
      setActiveCategoryKey(null);
      setActiveArticleId(null);
    }
  }, [activeCategoryKey, sectionedCategories]);

  useEffect(() => {
    if (!activeArticleId) return;
    if (!activeCategory || !activeCategory.category.articles.some((article) => article.id === activeArticleId)) {
      setActiveArticleId(null);
    }
  }, [activeArticleId, activeCategory]);

  const openCategory = (category: PulseCategorySnapshot) => {
    setActiveCategoryKey(categoryKeyOf(category));
    setActiveArticleId(null);
  };

  const handleBack = () => {
    if (viewMode === 'article') {
      setActiveArticleId(null);
      return;
    }
    setActiveCategoryKey(null);
  };

  const handleAddInterest = () => {
    const next = sanitizeInterests([...interests, interestInput]);
    if (next.length === interests.length) {
      setInterestInput('');
      return;
    }
    setInterests(next);
    savePulseInterests(next);
    setInterestInput('');
    void fetchLive('refresh', next);
  };

  const handleRemoveInterest = (value: string) => {
    const next = interests.filter((item) => item !== value);
    const effective = next.length > 0 ? next : [...DEFAULT_PULSE_INTERESTS];
    setInterests(effective);
    savePulseInterests(effective);
    void fetchLive('refresh', effective);
  };

  const applySourcePolicy = (nextPolicy: PulseSourcePolicy) => {
    const sanitizedPolicy = {
      allowDomains: sanitizeDomains(nextPolicy.allowDomains || []),
      denyDomains: sanitizeDomains(nextPolicy.denyDomains || [])
    };
    setSourcePolicy(sanitizedPolicy);
    savePulseSourcePolicy(sanitizedPolicy);
    void savePulseSourcePolicyToServer(sanitizedPolicy);
    void fetchLive('refresh', interests, sanitizedPolicy);
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

  const handleRemoveAllowDomain = (domain: string) => {
    applySourcePolicy({
      ...sourcePolicy,
      allowDomains: sourcePolicy.allowDomains.filter((item) => item !== domain)
    });
  };

  const handleRemoveDenyDomain = (domain: string) => {
    applySourcePolicy({
      ...sourcePolicy,
      denyDomains: sourcePolicy.denyDomains.filter((item) => item !== domain)
    });
  };

  const handleFeedback = async (article: PulseArticle, relevant: boolean) => {
    setFeedbackStatus((prev) => ({ ...prev, [article.id]: 'sending' }));
    setFeedbackMap((prev) => ({ ...prev, [article.id]: relevant }));
    try {
      const ok = await submitPulseFeedback({
        article,
        relevant,
        snapshotDate: currentSnapshot?.dateKey
      });
      if (!ok) {
        setErrorText('Feedback saved locally, but server sync failed.');
      } else if (!isViewingHistory) {
        void fetchLive('refresh');
      }
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

  if (isLoading && !currentSnapshot) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-300">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!currentSnapshot) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
        Pulse snapshot not found. Click refresh to fetch latest.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Daily Intel</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Thailand Pulse</h1>
            <p className="mt-1 text-sm text-slate-400">
              One-page digest. Click a topic to drill down into article lists, then open story details.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {viewMode !== 'overview' && (
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-cyan-400/45 hover:text-cyan-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            <button
              onClick={() => void fetchLive('refresh')}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isRefreshing ? 'Refreshing...' : 'Refresh now'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Generated</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{formatDateTime(currentSnapshot.generatedAt)}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Articles</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{totalArticles}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Trusted Sources</p>
            <p className="mt-1 text-xl font-semibold text-emerald-100">{currentSnapshot.sourceCoverage.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Provider</p>
            <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${providerTone[currentSnapshot.provider || 'RSS'] || providerTone.RSS}`}>
              {currentSnapshot.provider || 'RSS'}
            </span>
          </div>
        </div>

        {errorText && (
          <p className="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {errorText}
          </p>
        )}
        {currentSnapshot.isFallback && (
          <p className="mt-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Live feeds unavailable. This snapshot is fallback mode.
          </p>
        )}
        {currentSnapshot.notes.length > 0 && (
          <details className="mt-3 rounded-xl border border-slate-700 bg-slate-900/85 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
              Pulse Notes ({currentSnapshot.notes.length})
            </summary>
            <div className="mt-2 space-y-1">
              {currentSnapshot.notes.map((note, index) => (
                <p key={`${note}-${index}`} className="text-[11px] text-slate-500">
                  • {note}
                </p>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">7-Day History</h2>
            <HelpTip
              th="เลือกดู snapshot ของวันก่อนหน้าได้สูงสุด 7 วัน"
              en="Switch between daily snapshots from the last 7 days."
            />
          </div>
          {isViewingHistory && (
            <p className="text-xs text-amber-200">
              Viewing {selectedDateKey}. Press refresh for the newest snapshot.
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {history.map((item) => {
            const isActive = item.dateKey === selectedDateKey;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedDateKey(item.dateKey);
                  setActiveCategoryKey(null);
                  setActiveArticleId(null);
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  isActive
                    ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-100'
                }`}
              >
                {toDateLabel(item.dateKey)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <button
          onClick={() => setIsConfigExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-cyan-200" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Pulse Config</p>
              <p className="text-xs text-slate-400">Interests and source policy controls</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300">
            {isConfigExpanded ? 'Hide Config' : 'Show Config'}
            {isConfigExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {isConfigExpanded && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Interests</p>
                <HelpTip
                  th="หัวข้อที่ใช้สร้าง query ข่าว สามารถเพิ่ม/ลบได้ตามต้องการ"
                  en="Topics used to generate the feed query set. Add or remove as needed."
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {interests.map((interest) => (
                  <button
                    key={interest}
                    onClick={() => handleRemoveInterest(interest)}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
                    title="Remove topic"
                  >
                    <span>{interest}</span>
                    <span className="text-slate-300">×</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={interestInput}
                  onChange={(event) => setInterestInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddInterest();
                    }
                  }}
                  placeholder="Add interest (e.g. Cybersecurity, EV, Thailand SET)"
                  className="min-w-[240px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-500/20"
                />
                <button
                  onClick={handleAddInterest}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-cyan-400/45 hover:text-cyan-100"
                >
                  <BadgePlus className="h-4 w-4" />
                  Add topic
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
                <p className="text-[11px] uppercase tracking-wide text-emerald-200">Allow Domains</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sourcePolicy.allowDomains.length === 0 && (
                    <span className="text-[11px] text-slate-500">Empty = allow all sources</span>
                  )}
                  {sourcePolicy.allowDomains.map((domain) => (
                    <button
                      key={domain}
                      onClick={() => handleRemoveAllowDomain(domain)}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100"
                    >
                      {domain} <span className="text-emerald-200">×</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={allowInput}
                    onChange={(event) => setAllowInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddAllowDomain();
                      }
                    }}
                    placeholder="example: reuters.com"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-400/45 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <button
                    onClick={handleAddAllowDomain}
                    className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
                <p className="text-[11px] uppercase tracking-wide text-rose-200">Deny Domains</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sourcePolicy.denyDomains.length === 0 && (
                    <span className="text-[11px] text-slate-500">No blocked domains</span>
                  )}
                  {sourcePolicy.denyDomains.map((domain) => (
                    <button
                      key={domain}
                      onClick={() => handleRemoveDenyDomain(domain)}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-400/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-100"
                    >
                      {domain} <span className="text-rose-200">×</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={denyInput}
                    onChange={(event) => setDenyInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddDenyDomain();
                      }
                    }}
                    placeholder="example: lowtrust.blog"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-rose-400/45 focus:ring-2 focus:ring-rose-500/20"
                  />
                  <button
                    onClick={handleAddDenyDomain}
                    className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-100"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {viewMode === 'overview' && (
        <section className="grid gap-4 xl:grid-cols-[2fr,1fr]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">Regional Headlines</h2>
                <HelpTip
                  th="แยกข่าวเป็น 2 ส่วน: ไทย และต่างประเทศ พร้อมแหล่งข่าวน่าเชื่อถือของแต่ละหัวข้อ"
                  en="Split into Thailand and Global sections with trusted sources per topic."
                />
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {sectionedCategories.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-xl border border-slate-700 bg-slate-900/95 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-100">
                        {section.label}
                      </p>
                      <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300">
                        {section.categories.reduce((sum, category) => sum + category.articles.length, 0)} stories
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {section.categories.length === 0 && (
                        <p className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-500">
                          No categories for this section in the selected snapshot.
                        </p>
                      )}
                      {section.categories.map((category) => (
                        <button
                          key={categoryKeyOf(category)}
                          onClick={() => openCategory(category)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900/90 p-2.5 text-left transition hover:border-cyan-400/45"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">{category.name}</p>
                            <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300">
                              {category.articles.length}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs text-slate-200">
                            {category.articles[0]?.title || 'No stories in this topic yet.'}
                          </p>
                          {Array.isArray(category.trustedSources) && category.trustedSources.length > 0 && (
                            <p className="mt-1 line-clamp-1 text-[10px] text-emerald-200/90">
                              Trusted: {category.trustedSources.slice(0, 3).join(' • ')}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-200" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">Trend Radar</h2>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentSnapshot.trends.length === 0 && (
                  <p className="text-xs text-slate-400">No trend signals in this snapshot.</p>
                )}
                {currentSnapshot.trends.slice(0, 10).map((trend) => (
                  <span
                    key={trend.label}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-100"
                  >
                    <Sparkles className="h-3 w-3" />
                    {trend.label} ({trend.count})
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">Source Coverage</h2>
              </div>
              <div className="mt-3 space-y-2">
                {currentSnapshot.sourceCoverage.length === 0 && (
                  <p className="text-xs text-slate-400">No source coverage data.</p>
                )}
                {currentSnapshot.sourceCoverage.slice(0, 8).map((entry) => (
                  <div key={`${entry.source}-${entry.tier}`} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2">
                    <p className="text-xs font-medium text-slate-100">{entry.source}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${tierTone[entry.tier] || tierTone.UNKNOWN}`}>
                      {entry.tier} • {entry.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {viewMode === 'category' && activeCategory && (
        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">{activeCategory.category.name}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {activeCategory.sectionLabel} • Query: {activeCategory.category.query}
              </p>
              {Array.isArray(activeCategory.category.trustedSources) && activeCategory.category.trustedSources.length > 0 && (
                <p className="mt-1 text-xs text-emerald-200/90">
                  Trusted sources: {activeCategory.category.trustedSources.slice(0, 3).join(' • ')}
                </p>
              )}
            </div>
            <span className="rounded-full border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-300">
              {activeCategory.category.articles.length} stories
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {activeCategory.category.articles.length === 0 && (
              <p className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-sm text-slate-400">
                No stories available in this category.
              </p>
            )}
            {activeCategory.category.articles.map((article) => (
              <div key={article.id} className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
                <button
                  onClick={() => setActiveArticleId(article.id)}
                  className="w-full text-left"
                >
                  <p className="text-sm font-semibold text-slate-100">{article.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-slate-600 px-2 py-0.5 text-slate-300">{article.source}</span>
                    <span className={`rounded-full border px-2 py-0.5 ${tierTone[article.trustTier] || tierTone.UNKNOWN}`}>
                      Tier {article.trustTier}
                    </span>
                    <span className="text-slate-500">{formatRelativeTime(article.publishedAt)}</span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {viewMode === 'article' && activeArticle && (
        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">{activeArticle.category}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">{activeArticle.title}</h2>
          <p className="mt-2 text-sm text-slate-300">{activeArticle.summary || 'No summary available.'}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-slate-600 px-2 py-0.5 text-slate-300">{activeArticle.source}</span>
            <span className={`rounded-full border px-2 py-0.5 ${tierTone[activeArticle.trustTier] || tierTone.UNKNOWN}`}>
              Tier {activeArticle.trustTier}
            </span>
            {activeArticle.provider && (
              <span className={`rounded-full border px-2 py-0.5 ${providerTone[activeArticle.provider] || providerTone.RSS}`}>
                {activeArticle.provider}
              </span>
            )}
            {Number.isFinite(Number(activeArticle.confidenceScore)) && (
              <span
                className={`rounded-full border px-2 py-0.5 ${
                  confidenceTone[activeArticle.confidenceLabel || 'MEDIUM'] || confidenceTone.MEDIUM
                }`}
                title={(activeArticle.confidenceReasons || []).join(' | ')}
              >
                {activeArticle.confidenceLabel || 'MEDIUM'} {Number(activeArticle.confidenceScore).toFixed(1)}
              </span>
            )}
            <span className="text-slate-500">{formatRelativeTime(activeArticle.publishedAt)}</span>
          </div>

          {activeArticle.confidenceReasons && activeArticle.confidenceReasons.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">{activeArticle.confidenceReasons.join(' • ')}</p>
          )}

          {activeArticle.citations && activeArticle.citations.length > 0 && (
            <details className="mt-3 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                Sources ({activeArticle.citations.length})
              </summary>
              <div className="mt-2 space-y-2">
                {activeArticle.citations.slice(0, 5).map((citation, idx) => (
                  <div key={`${citation.url}-${idx}`} className="rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1.5">
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-cyan-100 hover:text-cyan-200"
                    >
                      {citation.label || 'Source'}
                    </a>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {citation.publisher || activeArticle.source}
                      {citation.publishedAt ? ` • ${new Date(citation.publishedAt).toLocaleString()}` : ''}
                    </p>
                    {citation.evidence && (
                      <p className="mt-1 text-[11px] text-slate-500">{citation.evidence}</p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={activeArticle.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 hover:text-cyan-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
            <button
              onClick={() => void handleSaveArticle(activeArticle)}
              disabled={(saveStatus[activeArticle.id] || 'idle') === 'saving' || (saveStatus[activeArticle.id] || 'idle') === 'saved'}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(saveStatus[activeArticle.id] || 'idle') === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (saveStatus[activeArticle.id] || 'idle') === 'saved' ? (
                <CircleCheck className="h-3.5 w-3.5" />
              ) : (
                <BookMarked className="h-3.5 w-3.5" />
              )}
              {(saveStatus[activeArticle.id] || 'idle') === 'saved' ? 'Saved' : 'Save to Resources'}
            </button>
            <button
              onClick={() => void handleFeedback(activeArticle, true)}
              disabled={feedbackStatus[activeArticle.id] === 'sending'}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                feedbackMap[activeArticle.id] === true
                  ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-100'
                  : 'border-slate-600 text-slate-300 hover:border-emerald-400/45 hover:text-emerald-100'
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              {feedbackStatus[activeArticle.id] === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Up'}
              Relevant
            </button>
            <button
              onClick={() => void handleFeedback(activeArticle, false)}
              disabled={feedbackStatus[activeArticle.id] === 'sending'}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                feedbackMap[activeArticle.id] === false
                  ? 'border-rose-400/45 bg-rose-500/20 text-rose-100'
                  : 'border-slate-600 text-slate-300 hover:border-rose-400/45 hover:text-rose-100'
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              {feedbackStatus[activeArticle.id] === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Down'}
              Not Relevant
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
