import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentRun, MemorySummary, ParaItem, ParaType } from '../types';
import { Loader2, RefreshCw, Play } from 'lucide-react';

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
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Agent Daily Brief</h3>
          <p className="text-sm text-slate-500">Runs orchestrator, stores summary, and tracks run status.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => onRunDaily()}
            disabled={isRunning}
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 flex items-center gap-2"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Daily
          </button>
          <button
            onClick={() => onRunDaily({ force: true })}
            disabled={isRunning}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-60"
          >
            Force Run
          </button>
        </div>
      </div>

      {lastError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
          {lastError}
        </div>
      )}

      {opsKpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">Overdue Tasks</p>
            <p className="text-lg font-bold text-slate-900">{opsKpis.overdueTasks}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">Triage Pending</p>
            <p className="text-lg font-bold text-slate-900">{opsKpis.triagePending}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">Net 30d</p>
            <p className={`text-lg font-bold ${opsKpis.net30d >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {opsKpis.net30d.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">Automation Success 7d</p>
            <p className="text-lg font-bold text-slate-900">{opsKpis.automationSuccessRate7d.toFixed(1)}%</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 md:p-6 min-h-[360px]">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-slate-900">Latest Summary</h4>
            {latestSummary && <span className="text-xs text-slate-500">{latestSummary.summaryDate}</span>}
          </div>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : latestSummary ? (
            <article className="prose prose-slate max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2">
              <ReactMarkdown>{latestSummary.contentMd}</ReactMarkdown>
            </article>
          ) : (
            <p className="text-sm text-slate-500">No daily summary yet. Run the daily agent to generate one.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6">
          <h4 className="font-semibold text-slate-900 mb-4">Recent Runs</h4>
          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {runs.length === 0 && <p className="text-sm text-slate-500">No runs found.</p>}
            {runs.map((run) => (
              <div key={run.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-600">{run.runType}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusClass[run.status]}`}>
                    {run.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500">Start: {new Date(run.startedAt).toLocaleString()}</p>
                {run.completedAt && <p className="text-xs text-slate-500">End: {new Date(run.completedAt).toLocaleString()}</p>}
                {run.errorText && <p className="text-xs text-rose-600 line-clamp-3">{run.errorText}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6">
        <h4 className="font-semibold text-slate-900 mb-4">Capture Triage</h4>
        <div className="space-y-3">
          {triageItems.length === 0 && (
            <p className="text-sm text-slate-500">No pending triage items.</p>
          )}
          {triageItems.map((item) => (
            <div key={item.id} className="border border-slate-200 rounded-xl p-3">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="text-xs text-slate-500 line-clamp-2 mt-1">{item.content}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => onResolveTriage(item.id, ParaType.TASK)}
                  className="text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-700"
                >
                  Approve Task
                </button>
                <button
                  onClick={() => onResolveTriage(item.id, ParaType.PROJECT)}
                  className="text-xs px-2 py-1 rounded-md bg-blue-100 text-blue-700"
                >
                  Convert Project
                </button>
                <button
                  onClick={() => onOpenTriageItem(item.id)}
                  className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700"
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
