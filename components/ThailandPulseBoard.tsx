import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgePlus,
  BookMarked,
  CircleCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import {
  DEFAULT_PULSE_INTERESTS,
  PulseArticle,
  ThailandPulseSnapshot,
  getLatestPulseSnapshot,
  getPulseInterests,
  getPulseSnapshotHistory,
  loadPulseSnapshotWithFallback,
  savePulseInterests,
  sanitizeInterests
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

const limitArticlesForPhaseOne = 4;

export const ThailandPulseBoard: React.FC<ThailandPulseBoardProps> = ({ onSaveArticle }) => {
  const [interests, setInterests] = useState<string[]>(() => getPulseInterests());
  const [interestInput, setInterestInput] = useState('');
  const [snapshot, setSnapshot] = useState<ThailandPulseSnapshot | null>(() => getLatestPulseSnapshot());
  const [history, setHistory] = useState<ThailandPulseSnapshot[]>(() => getPulseSnapshotHistory());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => getLatestPulseSnapshot()?.dateKey || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
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
    async (mode: 'initial' | 'refresh', targetInterests?: string[]) => {
      setErrorText(null);
      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);
      try {
        const effectiveInterests = targetInterests || interests;
        const next = await loadPulseSnapshotWithFallback(effectiveInterests);
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
    [hydrateFromStorage, interests]
  );

  useEffect(() => {
    hydrateFromStorage();
    if (!getLatestPulseSnapshot()) {
      void fetchLive('initial');
    }
  }, [fetchLive, hydrateFromStorage]);

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
              One-page briefing for Thailand-focused technology, AI, economy, politics, and business updates.
            </p>
          </div>
          <button
            onClick={() => void fetchLive('refresh')}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isRefreshing ? 'Refreshing...' : 'Refresh now'}
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Generated</p>
              <HelpTip
                th="เวลาอัปเดต snapshot ล่าสุดของหน้า Pulse"
                en="Timestamp of the latest generated pulse snapshot."
              />
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-100">{formatDateTime(currentSnapshot.generatedAt)}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Articles</p>
              <HelpTip
                th="จำนวนข่าวที่ดึงมาใน snapshot ปัจจุบัน"
                en="Total number of fetched articles in the current snapshot."
              />
            </div>
            <p className="mt-1 text-xl font-semibold text-slate-100">{totalArticles}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Trusted Sources</p>
              <HelpTip
                th="จำนวนสำนักข่าวที่มีการจัดระดับความน่าเชื่อถือใน snapshot นี้"
                en="Count of source outlets with trust-tier labeling in this snapshot."
              />
            </div>
            <p className="mt-1 text-xl font-semibold text-emerald-100">{currentSnapshot.sourceCoverage.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Trend Signals</p>
              <HelpTip
                th="คีย์เวิร์ดที่ถูกพูดถึงบ่อยที่สุดในชุดข่าวรอบนี้"
                en="Most repeated keywords detected across this pulse batch."
              />
            </div>
            <p className="mt-1 text-xl font-semibold text-cyan-100">{currentSnapshot.trends.length}</p>
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
          <div className="mt-2 space-y-1">
            {currentSnapshot.notes.slice(0, 3).map((note, index) => (
              <p key={`${note}-${index}`} className="text-[11px] text-slate-500">
                • {note}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
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
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          {currentSnapshot.categories.map((category) => (
            <article key={category.name} className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">{category.name}</h2>
                  <HelpTip
                    th="ข่าวล่าสุดที่ถูกจัดเข้าหมวดนี้ตาม query ที่กำหนด"
                    en="Latest stories mapped into this category based on its search query."
                  />
                </div>
                <span className="text-xs text-slate-400">
                  {Math.min(category.articles.length, limitArticlesForPhaseOne)} / {category.articles.length} shown
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Query: {category.query}</p>

              <div className="mt-3 space-y-2">
                {category.articles.slice(0, limitArticlesForPhaseOne).map((article) => {
                  const status = saveStatus[article.id] || 'idle';
                  return (
                    <div
                      key={article.id}
                      className="rounded-xl border border-slate-700 bg-slate-900/95 p-3"
                    >
                      <p className="text-sm font-semibold text-slate-100">{article.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{article.summary || 'No summary available.'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded-full border border-slate-600 px-2 py-0.5 text-slate-300">{article.source}</span>
                        <span className={`rounded-full border px-2 py-0.5 ${tierTone[article.trustTier] || tierTone.UNKNOWN}`}>
                          Tier {article.trustTier}
                        </span>
                        <span className="text-slate-500">{formatRelativeTime(article.publishedAt)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 hover:text-cyan-100"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                        <button
                          onClick={() => void handleSaveArticle(article)}
                          disabled={status === 'saving' || status === 'saved'}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {status === 'saving' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : status === 'saved' ? (
                            <CircleCheck className="h-3.5 w-3.5" />
                          ) : (
                            <BookMarked className="h-3.5 w-3.5" />
                          )}
                          {status === 'saved' ? 'Saved' : 'Save to Resources'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-200" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">Trend Radar</h2>
              <HelpTip
                th="คีย์เวิร์ดที่พบซ้ำในข่าวเพื่อสะท้อนกระแสเด่นรอบนี้"
                en="Repeated keywords detected from headlines to indicate current trends."
              />
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
              <HelpTip
                th="สรุปจำนวนข่าวจากแหล่งข่าวต่างๆ ที่ถูกดึงมา"
                en="Distribution of fetched stories by publisher and trust tier."
              />
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

          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">7-Day History</h2>
              <HelpTip
                th="เลือกดู snapshot ของวันก่อนหน้าได้สูงสุด 7 วัน"
                en="Switch between daily snapshots from the last 7 days."
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {history.map((item) => {
                const isActive = item.dateKey === selectedDateKey;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedDateKey(item.dateKey)}
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
            {isViewingHistory && (
              <p className="mt-3 text-xs text-amber-200">
                Viewing historical snapshot ({selectedDateKey}). Press refresh to pull the newest set.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
};
