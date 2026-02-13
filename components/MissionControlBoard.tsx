import React, { useMemo } from 'react';
import { AgentRun, ParaItem, ParaType } from '../types';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Layers,
  Sparkles,
  Target
} from 'lucide-react';

interface MissionControlBoardProps {
  items: ParaItem[];
  runs: AgentRun[];
  triageItems: ParaItem[];
  onOpenItem: (id: string) => void;
  onGoAgent: () => void;
}

const isOverdue = (item: ParaItem): boolean => {
  if (!item.dueDate || item.isCompleted) return false;
  return new Date(item.dueDate).getTime() < Date.now();
};

const isDueSoon = (item: ParaItem): boolean => {
  if (!item.dueDate || item.isCompleted) return false;
  const delta = new Date(item.dueDate).getTime() - Date.now();
  return delta >= 0 && delta <= 1000 * 60 * 60 * 48;
};

const buildSparkline = (values: number[], width: number, height: number): string => {
  if (values.length === 0) return '';
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * height;
      return `${x},${y}`;
    })
    .join(' ');
};

export const MissionControlBoard: React.FC<MissionControlBoardProps> = ({
  items,
  runs,
  triageItems,
  onOpenItem,
  onGoAgent
}) => {
  const allTasks = useMemo(() => items.filter((i) => i.type === ParaType.TASK), [items]);
  const areas = useMemo(() => items.filter((i) => i.type === ParaType.AREA), [items]);
  const openTasks = useMemo(() => allTasks.filter((i) => !i.isCompleted), [allTasks]);
  const completedTasks = useMemo(() => allTasks.filter((i) => !!i.isCompleted), [allTasks]);
  const overdueTasks = useMemo(() => openTasks.filter((t) => isOverdue(t)), [openTasks]);
  const dueSoonTasks = useMemo(() => openTasks.filter((t) => isDueSoon(t)).slice(0, 8), [openTasks]);
  const backlogTasks = useMemo(() => openTasks.filter((t) => !t.dueDate && !(t.tags || []).includes('triage-pending')).slice(0, 8), [openTasks]);
  const latestRun = runs[0] || null;
  const completionRate = useMemo(
    () => (allTasks.length ? Math.round((completedTasks.length / allTasks.length) * 100) : 0),
    [allTasks.length, completedTasks.length]
  );
  const laneData = useMemo(
    () => [
      { label: 'Overdue', value: overdueTasks.length, color: '#fb7185' },
      { label: 'DueSoon', value: dueSoonTasks.length, color: '#fbbf24' },
      { label: 'Backlog', value: backlogTasks.length, color: '#22d3ee' }
    ],
    [backlogTasks.length, dueSoonTasks.length, overdueTasks.length]
  );
  const runStatus = useMemo(
    () => ({
      success: runs.filter((r) => r.status === 'SUCCESS').length,
      failed: runs.filter((r) => r.status === 'FAILED').length,
      started: runs.filter((r) => r.status === 'STARTED').length
    }),
    [runs]
  );
  const timeline7d = useMemo(() => {
    const labels: string[] = [];
    const counts: number[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(key.slice(5));
      counts.push(allTasks.filter((t) => (t.createdAt || '').slice(0, 10) === key).length);
    }
    return { labels, counts };
  }, [allTasks]);
  const sparkline = useMemo(() => buildSparkline(timeline7d.counts, 300, 88), [timeline7d.counts]);

  const focusNow = useMemo(
    () =>
      [...overdueTasks, ...dueSoonTasks]
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
        .slice(0, 6),
    [dueSoonTasks, overdueTasks]
  );

  return (
    <div className="space-y-4 pb-24">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Mission Overview</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">PARA Mission Control</h1>
            <p className="mt-1 text-sm text-slate-400">Centralized focus lane for tasks, incidents, and daily run health.</p>
          </div>
          <button
            onClick={onGoAgent}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
          >
            <Bot className="h-4 w-4" />
            Open Agent Queue
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Active Areas</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{areas.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Open Tasks</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{openTasks.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Overdue</p>
            <p className="mt-1 text-xl font-semibold text-rose-200">{overdueTasks.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Triage Queue</p>
            <p className="mt-1 text-xl font-semibold text-amber-200">{triageItems.length}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${completionRate}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Task completion: {completionRate}%</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Lane Distribution</h2>
            <span className="text-xs text-slate-400">SVG bar chart</span>
          </div>
          <svg viewBox="0 0 320 170" className="w-full">
            <line x1="24" y1="140" x2="306" y2="140" stroke="#334155" strokeWidth="1" />
            {laneData.map((lane, index) => {
              const max = Math.max(1, ...laneData.map((d) => d.value));
              const barHeight = (lane.value / max) * 96;
              const x = 40 + index * 92;
              return (
                <g key={lane.label}>
                  <rect x={x} y={140 - barHeight} width={54} height={barHeight} rx={8} fill={lane.color} opacity="0.9" />
                  <text x={x + 27} y={154} textAnchor="middle" fill="#94a3b8" fontSize="11">
                    {lane.label}
                  </text>
                  <text x={x + 27} y={132 - barHeight} textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="700">
                    {lane.value}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Captured Tasks (7d)</h2>
            <span className="text-xs text-slate-400">SVG line chart</span>
          </div>
          <svg viewBox="0 0 340 170" className="w-full">
            <line x1="20" y1="120" x2="320" y2="120" stroke="#334155" strokeWidth="1" />
            <polyline points={sparkline} transform="translate(20,24)" fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {timeline7d.counts.map((count, index) => {
              const max = Math.max(1, ...timeline7d.counts);
              const x = 20 + (timeline7d.counts.length > 1 ? (300 / (timeline7d.counts.length - 1)) * index : 0);
              const y = 24 + (88 - (count / max) * 88);
              return (
                <g key={`${timeline7d.labels[index]}-${count}`}>
                  <circle cx={x} cy={y} r={4} fill="#06b6d4" />
                  <text x={x} y={138} textAnchor="middle" fill="#94a3b8" fontSize="10">
                    {timeline7d.labels[index]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-200">
            <Target className="h-4 w-4" />
            Focus Now
          </h2>
          <span className="text-xs text-slate-400">{focusNow.length} tasks</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {focusNow.length === 0 && (
            <p className="col-span-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Queue is clear. No overdue or urgent tasks right now.
            </p>
          )}
          {focusNow.map((item) => (
            <button
              key={item.id}
              onClick={() => onOpenItem(item.id)}
              className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-left hover:border-cyan-400/50"
            >
              <p className="text-sm font-semibold text-slate-100 line-clamp-1">{item.title}</p>
              <p className="mt-1 text-xs text-slate-400 line-clamp-1">{item.category || 'Uncategorized'}</p>
              <p className={`mt-2 text-xs ${isOverdue(item) ? 'text-rose-300' : 'text-amber-300'}`}>
                {isOverdue(item) ? 'Overdue' : `Due ${new Date(item.dueDate || '').toLocaleString()}`}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-200">
              <Layers className="h-4 w-4" />
              Unified Task Lanes
            </h2>
            <span className="text-xs text-slate-400">Drag/order later</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-rose-400/35 bg-rose-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Overdue</p>
              <div className="mt-2 space-y-2">
                {overdueTasks.slice(0, 6).map((t) => (
                  <button key={t.id} onClick={() => onOpenItem(t.id)} className="w-full rounded-lg border border-rose-400/25 bg-slate-950/60 px-2 py-1.5 text-left text-xs text-rose-100 hover:border-rose-300/50 line-clamp-2">
                    {t.title}
                  </button>
                ))}
                {overdueTasks.length === 0 && <p className="text-xs text-rose-200/70">No overdue tasks</p>}
              </div>
            </div>

            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Due Soon (48h)</p>
              <div className="mt-2 space-y-2">
                {dueSoonTasks.slice(0, 6).map((t) => (
                  <button key={t.id} onClick={() => onOpenItem(t.id)} className="w-full rounded-lg border border-amber-400/25 bg-slate-950/60 px-2 py-1.5 text-left text-xs text-amber-100 hover:border-amber-300/50 line-clamp-2">
                    {t.title}
                  </button>
                ))}
                {dueSoonTasks.length === 0 && <p className="text-xs text-amber-200/70">No upcoming deadlines</p>}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-400/35 bg-cyan-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Backlog</p>
              <div className="mt-2 space-y-2">
                {backlogTasks.slice(0, 6).map((t) => (
                  <button key={t.id} onClick={() => onOpenItem(t.id)} className="w-full rounded-lg border border-cyan-400/25 bg-slate-950/60 px-2 py-1.5 text-left text-xs text-cyan-100 hover:border-cyan-300/50 line-clamp-2">
                    {t.title}
                  </button>
                ))}
                {backlogTasks.length === 0 && <p className="text-xs text-cyan-200/70">No backlog items</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Run Mix
            </h2>
            <div className="mt-3 flex items-center gap-4">
              <svg viewBox="0 0 120 120" className="h-24 w-24">
                {(() => {
                  const total = Math.max(1, runStatus.success + runStatus.failed + runStatus.started);
                  const radius = 42;
                  const circumference = 2 * Math.PI * radius;
                  const successLen = (runStatus.success / total) * circumference;
                  const failedLen = (runStatus.failed / total) * circumference;
                  const startedLen = (runStatus.started / total) * circumference;
                  return (
                    <>
                      <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="14" />
                      <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="14"
                        strokeDasharray={`${successLen} ${circumference - successLen}`}
                        transform="rotate(-90 60 60)"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke="#fb7185"
                        strokeWidth="14"
                        strokeDasharray={`${failedLen} ${circumference - failedLen}`}
                        strokeDashoffset={-successLen}
                        transform="rotate(-90 60 60)"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="14"
                        strokeDasharray={`${startedLen} ${circumference - startedLen}`}
                        strokeDashoffset={-(successLen + failedLen)}
                        transform="rotate(-90 60 60)"
                      />
                    </>
                  );
                })()}
              </svg>
              <div className="space-y-1 text-xs text-slate-300">
                <p><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Success: {runStatus.success}</p>
                <p><span className="inline-block h-2 w-2 rounded-full bg-rose-400" /> Failed: {runStatus.failed}</p>
                <p><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Running: {runStatus.started}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Run Health
            </h2>
            {latestRun ? (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/95 p-3">
                <p className="text-sm font-semibold text-slate-100">{latestRun.runType}</p>
                <p className="mt-1 text-xs text-slate-400">Started {new Date(latestRun.startedAt).toLocaleString()}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {latestRun.status === 'SUCCESS' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                      <span className="text-emerald-200">Latest run succeeded</span>
                    </>
                  ) : latestRun.status === 'FAILED' ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                      <span className="text-rose-200">Latest run failed</span>
                    </>
                  ) : (
                    <>
                      <Clock3 className="h-3.5 w-3.5 text-amber-300" />
                      <span className="text-amber-200">Run in progress</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">No run data yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-200">
              <ArrowRight className="h-4 w-4" />
              Next Command
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li className="rounded-lg border border-slate-700 bg-slate-900/95 p-2.5">1. Clear overdue lane first</li>
              <li className="rounded-lg border border-slate-700 bg-slate-900/95 p-2.5">2. Resolve triage-pending captures</li>
              <li className="rounded-lg border border-slate-700 bg-slate-900/95 p-2.5">3. Trigger daily run if stale</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  );
};
