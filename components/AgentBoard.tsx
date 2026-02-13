import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentRun, MemorySummary, ParaItem, ParaType } from '../types';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Siren,
  Workflow
} from 'lucide-react';

interface AgentBoardProps {
  isLoading: boolean;
  isRunning: boolean;
  lastError: string | null;
  latestSummary: MemorySummary | null;
  runs: AgentRun[];
  triageItems: ParaItem[];
  onRefresh: () => void;
  onRunDaily: (opts?: { force?: boolean }) => void;
  onResolveTriage: (itemId: string, type: ParaType) => void;
  onOpenTriageItem: (itemId: string) => void;
  opsKpis?: {
    overdueTasks: number;
    triagePending: number;
    net30d: number;
    automationSuccessRate7d: number;
  };
}

const statusClass: Record<AgentRun['status'], string> = {
  STARTED: 'bg-amber-100 text-amber-700',
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700'
};

const statusTone: Record<AgentRun['status'], string> = {
  STARTED: 'border-amber-400/50 bg-amber-500/10 text-amber-200',
  SUCCESS: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200',
  FAILED: 'border-rose-400/50 bg-rose-500/10 text-rose-200'
};

export const AgentBoard: React.FC<AgentBoardProps> = ({
  isLoading,
  isRunning,
  lastError,
  latestSummary,
  runs,
  triageItems,
  onRefresh,
  onRunDaily,
  onResolveTriage,
  onOpenTriageItem,
  opsKpis
}) => {
  const [mobilePane, setMobilePane] = useState<'command' | 'queue' | 'feed'>('command');

  const runningRuns = useMemo(() => runs.filter((r) => r.status === 'STARTED'), [runs]);
  const failedRuns = useMemo(() => runs.filter((r) => r.status === 'FAILED').slice(0, 6), [runs]);
  const successfulRuns = useMemo(() => runs.filter((r) => r.status === 'SUCCESS').slice(0, 6), [runs]);

  const queueSummary = useMemo(() => {
    const pendingAttention = failedRuns.length + triageItems.length;
    return {
      running: runningRuns.length,
      pendingAttention,
      healthy: pendingAttention === 0 && runningRuns.length === 0
    };
  }, [failedRuns.length, triageItems.length, runningRuns.length]);

  const timeline = useMemo(() => runs.slice(0, 10), [runs]);

  const renderCommandPane = () => (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Command Center</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-100">Agent Daily Control</h3>
            <p className="mt-1 text-sm text-slate-400">Run orchestrator, watch queue health, and clear triage backlog.</p>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${queueSummary.healthy ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/40 bg-amber-500/10 text-amber-200'}`}>
            {queueSummary.healthy ? <ShieldCheck className="h-3.5 w-3.5" /> : <Siren className="h-3.5 w-3.5" />}
            {queueSummary.healthy ? 'Stable' : 'Needs Attention'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Running</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{queueSummary.running}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Alert Queue</p>
            <p className="mt-1 text-xl font-semibold text-amber-200">{queueSummary.pendingAttention}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Success 7d</p>
            <p className="mt-1 text-xl font-semibold text-emerald-200">{opsKpis ? `${opsKpis.automationSuccessRate7d.toFixed(1)}%` : '-'}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Controls</p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={() => onRunDaily()}
            disabled={isRunning}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isRunning ? 'Running Daily Job' : 'Run Daily Brief'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onRefresh}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={() => onRunDaily({ force: true })}
              disabled={isRunning}
              className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AlertTriangle className="h-4 w-4" />
              Force Run
            </button>
          </div>
        </div>
      </section>

      {opsKpis && (
        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Operational Pulse</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-500">Overdue Tasks</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{opsKpis.overdueTasks}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-500">Triage Pending</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{opsKpis.triagePending}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-500">Net 30d</p>
              <p className={`mt-1 text-lg font-semibold ${opsKpis.net30d >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                {opsKpis.net30d.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-500">Run Success 7d</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{opsKpis.automationSuccessRate7d.toFixed(1)}%</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  const renderQueuePane = () => (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Queue Board</p>
            <h4 className="mt-1 text-base font-semibold text-slate-100">Run + Triage Workflow</h4>
          </div>
          <Workflow className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Running</p>
              <span className="text-xs text-slate-400">{runningRuns.length}</span>
            </div>
            <div className="space-y-2">
              {runningRuns.length === 0 && <p className="text-xs text-slate-500">No active run.</p>}
              {runningRuns.map((run) => (
                <article key={run.id} className={`rounded-lg border p-2 text-xs ${statusTone[run.status]}`}>
                  <p className="font-semibold">{run.runType}</p>
                  <p className="mt-1 opacity-80">Started {new Date(run.startedAt).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Needs Attention</p>
              <span className="text-xs text-slate-400">{failedRuns.length + triageItems.length}</span>
            </div>
            <div className="space-y-2">
              {failedRuns.map((run) => (
                <article key={run.id} className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-200">
                  <p className="font-semibold">{run.runType}</p>
                  <p className="mt-1 line-clamp-2 opacity-80">{run.errorText || 'Run failed'}</p>
                </article>
              ))}
              {triageItems.map((item) => (
                <article key={item.id} className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                  <p className="font-semibold line-clamp-1">{item.title}</p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      onClick={() => onResolveTriage(item.id, ParaType.TASK)}
                      className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-1.5 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20"
                    >
                      Task
                    </button>
                    <button
                      onClick={() => onResolveTriage(item.id, ParaType.PROJECT)}
                      className="rounded-md border border-blue-400/50 bg-blue-500/10 px-1.5 py-1 text-[10px] font-semibold text-blue-200 hover:bg-blue-500/20"
                    >
                      Project
                    </button>
                    <button
                      onClick={() => onOpenTriageItem(item.id)}
                      className="rounded-md border border-slate-500/60 bg-slate-800 px-1.5 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      Open
                    </button>
                  </div>
                </article>
              ))}
              {failedRuns.length === 0 && triageItems.length === 0 && (
                <p className="text-xs text-slate-500">No blockers in queue.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 md:col-span-2 xl:col-span-1">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Recent Success</p>
              <span className="text-xs text-slate-400">{successfulRuns.length}</span>
            </div>
            <div className="space-y-2">
              {successfulRuns.length === 0 && <p className="text-xs text-slate-500">No success run yet.</p>}
              {successfulRuns.map((run) => (
                <article key={run.id} className="rounded-lg border border-emerald-400/50 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                  <p className="font-semibold">{run.runType}</p>
                  <p className="mt-1 opacity-80">Ended {run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderFeedPane = () => (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Live Feed</p>
            <h4 className="mt-1 text-base font-semibold text-slate-100">Latest Summary</h4>
          </div>
          <Sparkles className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/95 p-3">
          {isLoading ? (
            <div className="h-44 flex items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : latestSummary ? (
            <article className="prose prose-invert prose-sm max-w-none prose-headings:mb-2 prose-headings:mt-4 prose-p:my-2">
              <ReactMarkdown>{latestSummary.contentMd}</ReactMarkdown>
            </article>
          ) : (
            <p className="text-sm text-slate-400">No daily summary yet. Trigger a run from Command pane.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Timeline</p>
          <Clock3 className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="mt-3 space-y-2">
          {timeline.length === 0 && <p className="text-sm text-slate-400">No events yet.</p>}
          {timeline.map((run) => (
            <article key={run.id} className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {run.status === 'FAILED' ? (
                    <AlertTriangle className="h-4 w-4 text-rose-300" />
                  ) : run.status === 'SUCCESS' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <Activity className="h-4 w-4 text-amber-300" />
                  )}
                  <p className="text-sm font-medium text-slate-100">{run.runType}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusClass[run.status]}`}>
                  {run.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Start {new Date(run.startedAt).toLocaleString()}</p>
              {run.errorText && <p className="mt-1 text-xs text-rose-300 line-clamp-2">{run.errorText}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-3 md:p-4">
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/90">Mission Control</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-100">
              <Bot className="h-5 w-5 text-cyan-300" />
              Agent Operations
            </h2>
            <p className="mt-1 text-sm text-slate-400">Operational cockpit for run orchestration, incident triage, and summary feed.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
            <Activity className="h-3.5 w-3.5 text-cyan-300" />
            {isRunning ? 'Daily run in progress' : 'Realtime monitoring active'}
          </div>
        </div>

        {lastError && (
          <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {lastError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs md:hidden">
          <button
            onClick={() => setMobilePane('command')}
            className={`rounded-lg border px-2 py-2 font-semibold ${mobilePane === 'command' ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            Command
          </button>
          <button
            onClick={() => setMobilePane('queue')}
            className={`rounded-lg border px-2 py-2 font-semibold ${mobilePane === 'queue' ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            Queue
          </button>
          <button
            onClick={() => setMobilePane('feed')}
            className={`rounded-lg border px-2 py-2 font-semibold ${mobilePane === 'feed' ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            Feed
          </button>
        </div>
      </div>

      <div className="hidden xl:grid xl:grid-cols-[320px_minmax(0,1fr)_360px] xl:gap-4">
        {renderCommandPane()}
        {renderQueuePane()}
        {renderFeedPane()}
      </div>

      <div className="hidden md:grid md:gap-4 xl:hidden">
        <div className="grid gap-4 lg:grid-cols-2">
          {renderCommandPane()}
          {renderQueuePane()}
        </div>
        {renderFeedPane()}
      </div>

      <div className="space-y-4 md:hidden">
        {mobilePane === 'command' && renderCommandPane()}
        {mobilePane === 'queue' && renderQueuePane()}
        {mobilePane === 'feed' && renderFeedPane()}
      </div>
    </div>
  );
};
