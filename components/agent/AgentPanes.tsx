// ─── Agent Board — Sub-pane Components ────────────────────────────────────────
// CommandPane, QueuePane, FeedPane extracted from AgentBoard for modularity.

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentRun, MemorySummary, ParaItem, ParaType } from '../../types';
import type { CaptureKpis } from '../../hooks/useAgentData';
import {
  AlertTriangle, ChevronDown, ChevronUp, Loader2, Play, RefreshCw,
  ShieldCheck, Sparkles, Siren, Workflow
} from 'lucide-react';

// ─── Shared helpers ───────────────────────────────────────────────────────────

export const statusTone: Record<AgentRun['status'], string> = {
  STARTED: 'border-amber-400/45 bg-amber-500/10 text-amber-100',
  SUCCESS: 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100',
  FAILED: 'border-rose-400/45 bg-rose-500/10 text-rose-100'
};

export const runTypeLabel = (runType: AgentRun['runType']) => runType.replaceAll('_', ' ');

export const formatDateTime = (value?: string) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const cleanSummaryLine = (line: string) =>
  line
    .replace(/\[[0-9a-f]{8}-[0-9a-f-]{20,}\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

export const HelpText: React.FC<{ th: string; en: string; className?: string }> = ({ th, en, className }) => (
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
      <span className="block"><span className="font-semibold text-cyan-200">TH:</span> {th}</span>
      <span className="mt-1 block"><span className="font-semibold text-cyan-200">EN:</span> {en}</span>
    </span>
  </span>
);

// ─── CommandPane ──────────────────────────────────────────────────────────────

interface CommandPaneProps {
  isRunning: boolean;
  opsKpis?: { overdueTasks: number; triagePending: number; net30d: number; automationSuccessRate7d: number };
  captureKpis?: CaptureKpis;
  queueSummary: { running: number; pendingAttention: number; healthy: boolean };
  showCaptureDeepDive: boolean;
  setShowCaptureDeepDive: (v: boolean) => void;
  onRunDaily: (opts?: { force?: boolean }) => void;
  onRefresh: () => void;
}

export const CommandPane: React.FC<CommandPaneProps> = ({
  isRunning, opsKpis, captureKpis, queueSummary,
  showCaptureDeepDive, setShowCaptureDeepDive, onRunDaily, onRefresh
}) => (
  <div className="space-y-3">
    <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Command Center</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-50">Agent Daily Control</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">Run orchestrator, watch queue health, and clear triage backlog.</p>
          <HelpText
            th="ศูนย์ควบคุมสำหรับรันงานประจำวันและดูสุขภาพคิวโดยรวม"
            en="Central controls for daily runs and overall queue health."
          />
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${queueSummary.healthy ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/45 bg-amber-500/10 text-amber-100'}`}>
          {queueSummary.healthy ? <ShieldCheck className="h-3.5 w-3.5" /> : <Siren className="h-3.5 w-3.5" />}
          {queueSummary.healthy ? 'Stable' : 'Needs Attention'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Running</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{queueSummary.running}</p>
          <HelpText th="จำนวนงานที่กำลังทำงานตอนนี้" en="Current count of actively running jobs." />
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Alert Queue</p>
          <p className="mt-1 text-xl font-semibold text-amber-100">{queueSummary.pendingAttention}</p>
          <HelpText th="รายการที่ยังต้องจัดการหรือแก้ไข" en="Pending items that still need action." />
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Success 7d</p>
          <p className="mt-1 text-xl font-semibold text-emerald-100">{opsKpis ? `${opsKpis.automationSuccessRate7d.toFixed(1)}%` : '-'}</p>
          <HelpText th="อัตราความสำเร็จย้อนหลัง 7 วัน" en="Run success rate over the last 7 days." />
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Controls</p>
      <HelpText th="ปุ่มสั่งรัน รีเฟรช และบังคับรันเมื่อจำเป็น" en="Action buttons to run, refresh, and force-run workflows." />
      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={() => onRunDaily()}
          disabled={isRunning}
          className="flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-3 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isRunning ? 'Running Daily Job' : 'Run Daily Brief'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onRefresh}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
          <button onClick={() => onRunDaily({ force: true })} disabled={isRunning}
            className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60">
            <AlertTriangle className="h-4 w-4" />Force Run
          </button>
        </div>
      </div>
    </section>

    {(opsKpis || captureKpis) && (
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Operational Snapshot</p>
        <HelpText th="สรุป KPI สำคัญแบบย่อให้อ่านจบในจอแรก" en="Condensed KPI snapshot to keep core signals in first viewport." />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {opsKpis && (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Overdue</p>
                <p className="mt-1 text-base font-semibold text-slate-100">{opsKpis.overdueTasks}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Triage</p>
                <p className="mt-1 text-base font-semibold text-slate-100">{opsKpis.triagePending}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Net 30d</p>
                <p className={`mt-1 text-base font-semibold ${opsKpis.net30d >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                  {opsKpis.net30d.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Success 7d</p>
                <p className="mt-1 text-base font-semibold text-slate-100">{opsKpis.automationSuccessRate7d.toFixed(1)}%</p>
              </div>
            </>
          )}
          {captureKpis && (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Captured</p>
                <p className="mt-1 text-base font-semibold text-slate-100">{captureKpis.totalToday}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Actionable</p>
                <p className="mt-1 text-base font-semibold text-slate-100">{captureKpis.actionableToday}</p>
              </div>
            </>
          )}
        </div>

        {captureKpis && (
          <div className="mt-3">
            <button
              onClick={() => setShowCaptureDeepDive(!showCaptureDeepDive)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-400/40 hover:text-cyan-100"
            >
              {showCaptureDeepDive ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showCaptureDeepDive ? 'Hide capture deep metrics' : 'Show capture deep metrics'}
            </button>
            {showCaptureDeepDive && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Intent Accuracy</p>
                  <p className="mt-1 text-sm font-semibold text-cyan-100">{captureKpis.intentAccuracyProxy.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Duplicate Skip</p>
                  <p className="mt-1 text-sm font-semibold text-amber-100">{captureKpis.duplicateSkipRate.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Pending Confirm</p>
                  <p className="mt-1 text-sm font-semibold text-rose-100">{captureKpis.pendingConfirmations}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Avg Confidence</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{captureKpis.avgConfidence.toFixed(1)}%</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    )}
  </div>
);

// ─── QueuePane ────────────────────────────────────────────────────────────────

interface QueuePaneProps {
  runningRuns: AgentRun[];
  failedRuns: AgentRun[];
  successfulRuns: AgentRun[];
  triageItems: ParaItem[];
  onResolveTriage: (itemId: string, type: ParaType) => void;
  onOpenTriageItem: (itemId: string) => void;
}

export const QueuePane: React.FC<QueuePaneProps> = ({
  runningRuns, failedRuns, successfulRuns, triageItems, onResolveTriage, onOpenTriageItem
}) => (
  <div className="space-y-4">
    <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Queue Board</p>
          <h4 className="mt-1 text-base font-semibold text-slate-50">Run + Triage Workflow</h4>
          <HelpText
            th="มุมมองคิวงาน แยกเป็นกำลังรัน ปัญหา และงานที่สำเร็จ"
            en="Queue view split into running, exception, and successful runs."
          />
        </div>
        <Workflow className="h-4 w-4 text-cyan-200" />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {/* Running */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Running</p>
            <span className="text-xs text-slate-400">{runningRuns.length}</span>
          </div>
          <HelpText th="งานที่กำลังรันอยู่แบบเรียลไทม์" en="Runs currently executing in real time." className="mb-2" />
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {runningRuns.length === 0 && <p className="text-sm text-slate-400">No active run.</p>}
            {runningRuns.map((run) => (
              <article key={run.id} className={`rounded-lg border p-2.5 text-sm ${statusTone[run.status]}`}>
                <p className="font-semibold">{runTypeLabel(run.runType)}</p>
                <p className="mt-1 text-xs opacity-85">Started {formatDateTime(run.startedAt)}</p>
                <HelpText th="เหตุการณ์รันงาน 1 รายการ" en="Single run event currently in progress." className="opacity-90" />
              </article>
            ))}
          </div>
        </div>

        {/* Needs Attention */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-100">Needs Attention</p>
            <span className="text-xs text-slate-400">{failedRuns.length + triageItems.length}</span>
          </div>
          <HelpText th="รายการผิดพลาดหรือ triage ที่ต้องตัดสินใจ" en="Failures and triage items that need decision/action." className="mb-2" />
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {failedRuns.map((run) => (
              <article key={run.id} className="rounded-lg border border-rose-400/45 bg-rose-500/10 p-2.5 text-sm text-rose-100">
                <p className="font-semibold">{runTypeLabel(run.runType)}</p>
                <p className="mt-1 line-clamp-2 text-xs opacity-90">{run.errorText || 'Run failed'}</p>
                <HelpText th="งานที่รันแล้วล้มเหลว ต้องตรวจสอบ" en="Run failed; requires inspection and recovery." className="opacity-95" />
              </article>
            ))}
            {triageItems.map((item) => (
              <article key={item.id} className="rounded-lg border border-amber-400/45 bg-amber-500/10 p-2.5 text-sm text-amber-100">
                <p className="font-semibold line-clamp-2">{item.title}</p>
                <HelpText th="ข้อความที่ยังไม่ชัดว่าควรเป็น Task หรือ Project" en="Unresolved capture waiting Task/Project classification." className="opacity-95" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button onClick={() => onResolveTriage(item.id, ParaType.TASK)} className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20">Task</button>
                  <button onClick={() => onResolveTriage(item.id, ParaType.PROJECT)} className="rounded-md border border-blue-400/50 bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-100 hover:bg-blue-500/20">Project</button>
                  <button onClick={() => onOpenTriageItem(item.id)} className="rounded-md border border-slate-500/70 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700">Open</button>
                </div>
              </article>
            ))}
            {failedRuns.length === 0 && triageItems.length === 0 && <p className="text-sm text-slate-400">No blockers in queue.</p>}
          </div>
        </div>

        {/* Recent Success */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Recent Success</p>
            <span className="text-xs text-slate-400">{successfulRuns.length}</span>
          </div>
          <HelpText th="งานที่รันสำเร็จล่าสุด ใช้เช็คเสถียรภาพระบบ" en="Most recent successful runs for stability checks." className="mb-2" />
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {successfulRuns.length === 0 && <p className="text-sm text-slate-400">No successful run yet.</p>}
            {successfulRuns.map((run) => (
              <article key={run.id} className="rounded-lg border border-emerald-400/45 bg-emerald-500/10 p-2.5 text-sm text-emerald-100">
                <p className="font-semibold">{runTypeLabel(run.runType)}</p>
                <p className="mt-1 text-xs opacity-90">Ended {formatDateTime(run.completedAt)}</p>
                <HelpText th="งานที่จบสำเร็จ 1 รายการ" en="Single completed successful run record." className="opacity-90" />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  </div>
);

// ─── FeedPane ─────────────────────────────────────────────────────────────────

const STALE_MS = 45 * 60 * 1000;
const isStaleStartedRun = (run: AgentRun) =>
  run.status === 'STARTED' && Date.now() - new Date(run.startedAt).getTime() > STALE_MS;

interface FeedPaneProps {
  isLoading: boolean;
  latestSummary: MemorySummary | null;
  runs: AgentRun[];
  triageItems: ParaItem[];
  successfulRuns: AgentRun[];
  timelineFilter: 'issues' | 'all' | 'success';
  setTimelineFilter: (v: 'issues' | 'all' | 'success') => void;
  onResolveTriage: (itemId: string, type: ParaType) => void;
  onOpenTriageItem: (itemId: string) => void;
  summaryDigest: string[];
}

export const FeedPane: React.FC<FeedPaneProps> = ({
  isLoading, latestSummary, runs, triageItems, successfulRuns,
  timelineFilter, setTimelineFilter, onResolveTriage, onOpenTriageItem, summaryDigest
}) => {
  const timeline = runs.slice(0, 10);
  const issueRuns = runs.filter((r) => r.status === 'FAILED' || isStaleStartedRun(r)).slice(0, 8);

  const historyRuns = timelineFilter === 'success'
    ? timeline.filter((r) => r.status === 'SUCCESS')
    : timelineFilter === 'issues'
      ? timeline.filter((r) => r.status === 'FAILED' || isStaleStartedRun(r))
      : timeline;

  return (
    <div className="space-y-4">
      {/* Latest Summary */}
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Live Feed</p>
            <h4 className="mt-1 text-base font-semibold text-slate-50">Latest Summary</h4>
            <HelpText th="สรุปสถานะล่าสุดจากเอเจนต์ เพื่ออ่านภาพรวมไวๆ" en="Latest agent summary for quick situational understanding." />
          </div>
          <Sparkles className="h-4 w-4 text-cyan-200" />
        </div>

        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/95 p-4">
          {isLoading ? (
            <div className="flex h-44 items-center justify-center text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : latestSummary ? (
            <div className="space-y-4">
              <header className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2">
                <p className="text-sm font-semibold text-cyan-100">{latestSummary.title || 'Daily Summary'}</p>
                <p className="text-xs text-cyan-200/80">{new Date(latestSummary.summaryDate).toLocaleDateString()}</p>
                <HelpText th="หัวข้อและวันที่ของสรุปล่าสุด" en="Title and date of the latest generated summary." className="text-cyan-100/90" />
              </header>
              {summaryDigest.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Quick Read</p>
                  <ul className="space-y-2">
                    {summaryDigest.map((line, idx) => (
                      <li key={`${idx}-${line.slice(0, 20)}`} className="rounded-md border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-slate-200">
                        {line}
                        <HelpText th="ประเด็นสำคัญที่ AI คัดมาให้อ่านก่อน" en="High-priority summary point extracted for fast reading." />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Open full markdown</summary>
                <HelpText th="กดเพื่อเปิดสรุปฉบับเต็มแบบ markdown" en="Expand to read the full markdown summary." />
                <article className="prose prose-invert prose-sm mt-3 max-w-none prose-headings:text-cyan-100 prose-p:my-2 prose-p:leading-7 prose-strong:text-slate-50 prose-li:my-1 prose-li:leading-6">
                  <ReactMarkdown>{latestSummary.contentMd}</ReactMarkdown>
                </article>
              </details>
            </div>
          ) : (
            <p className="text-sm text-slate-300">No daily summary yet. Trigger a run from Command pane.</p>
          )}
        </div>
      </section>

      {/* Exception Feed */}
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Exception Feed</p>
            <p className="mt-1 text-sm text-slate-300">Show only blockers and unstable runs first.</p>
            <HelpText th="แสดงเฉพาะปัญหาสำคัญและงานที่ต้องรีบตัดสินใจ" en="Prioritized feed for blockers and urgent interventions." />
          </div>
          <AlertTriangle className="h-4 w-4 text-amber-200" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-rose-100/85">Open Exceptions</p>
            <p className="mt-1 text-lg font-semibold text-rose-100">{issueRuns.length + triageItems.length}</p>
            <HelpText th="จำนวน exception ที่ยังไม่ถูกแก้" en="Count of unresolved exceptions right now." />
          </div>
          <div className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-emerald-100/85">Latest Success</p>
            <p className="mt-1 text-sm font-semibold text-emerald-100">
              {successfulRuns[0] ? formatDateTime(successfulRuns[0].completedAt || successfulRuns[0].startedAt) : '-'}
            </p>
            <HelpText th="เวลาล่าสุดที่มีงานสำเร็จ" en="Most recent timestamp of a successful run." />
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {issueRuns.length === 0 && triageItems.length === 0 && (
            <p className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">No active blockers. System looks stable.</p>
          )}
          {issueRuns.map((run) => {
            const isStale = isStaleStartedRun(run);
            return (
              <article key={run.id} className={`rounded-xl border p-3 ${run.status === 'FAILED' ? 'border-rose-400/45 bg-rose-500/10' : isStale ? 'border-amber-400/45 bg-amber-500/10' : 'border-slate-700 bg-slate-900/95'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{runTypeLabel(run.runType)}</p>
                  {run.status === 'FAILED'
                    ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">FAILED</span>
                    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">STALE RUN</span>}
                </div>
                <p className="mt-1 text-xs text-slate-300">Started {formatDateTime(run.startedAt)}</p>
                {run.errorText && <p className="mt-1 line-clamp-2 text-xs text-rose-100">{run.errorText}</p>}
                <HelpText th="การ์ดแจ้งเตือนเหตุผิดปกติจากระบบรัน" en="Exception card for failed or potentially stuck run." />
              </article>
            );
          })}
          {triageItems.slice(0, 4).map((item) => (
            <article key={item.id} className="rounded-xl border border-amber-400/45 bg-amber-500/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-100 line-clamp-2">{item.title}</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">TRIAGE</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => onResolveTriage(item.id, ParaType.TASK)} className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20">Task</button>
                <button onClick={() => onResolveTriage(item.id, ParaType.PROJECT)} className="rounded-md border border-blue-400/50 bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-100 hover:bg-blue-500/20">Project</button>
                <button onClick={() => onOpenTriageItem(item.id)} className="rounded-md border border-slate-500/70 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700">Open</button>
              </div>
              <HelpText th="การ์ด triage สำหรับจัดประเภทหรือเปิดดูรายละเอียด" en="Triage card to classify item or open full detail." />
            </article>
          ))}
        </div>

        <details className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
            View Full Run History ({timeline.length})
          </summary>
          <HelpText th="เปิดประวัติการรันย้อนหลัง พร้อมกรองประเภทเหตุการณ์" en="Expand to inspect historical runs with status filters." />
          <div className="mt-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(['issues', 'all', 'success'] as const).map((f) => (
                <button key={f} onClick={() => setTimelineFilter(f)}
                  className={`rounded-md border px-2 py-1.5 font-semibold ${timelineFilter === f ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {historyRuns.length === 0 && <p className="text-sm text-slate-300">No runs for this filter.</p>}
              {historyRuns.map((run) => {
                const isStale = isStaleStartedRun(run);
                return (
                  <article key={run.id} className="rounded-lg border border-slate-700 bg-slate-900/95 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-100">{runTypeLabel(run.runType)}</p>
                      {run.status === 'FAILED' ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">FAILED</span>
                        : run.status === 'SUCCESS' ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">SUCCESS</span>
                        : isStale ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">STALE</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">STARTED</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Start {formatDateTime(run.startedAt)}</p>
                    {run.completedAt && <p className="text-[11px] text-slate-400">End {formatDateTime(run.completedAt)}</p>}
                    {run.errorText && <p className="mt-1 line-clamp-2 text-[11px] text-rose-200">{run.errorText}</p>}
                    <HelpText th="บันทึกการรันหนึ่งรายการในประวัติย้อนหลัง" en="Single historical run entry with status and timing." />
                  </article>
                );
              })}
            </div>
          </div>
        </details>
      </section>
    </div>
  );
};

// Re-export cleanSummaryLine for use in AgentBoard
export { cleanSummaryLine };
