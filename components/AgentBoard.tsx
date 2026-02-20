import React, { useMemo, useState } from 'react';
import { AgentRun, MemorySummary, ParaItem, ParaType } from '../types';
import type { CaptureKpis } from '../hooks/useAgentData';
import { Activity, Bot } from 'lucide-react';
import {
  CommandPane, QueuePane, FeedPane, HelpText,
  statusTone, runTypeLabel, formatDateTime, cleanSummaryLine
} from './agent/AgentPanes';

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
  captureKpis?: CaptureKpis;
}

const STALE_MS = 45 * 60 * 1000;
const isStaleStartedRun = (run: AgentRun) =>
  run.status === 'STARTED' && Date.now() - new Date(run.startedAt).getTime() > STALE_MS;

export const AgentBoard: React.FC<AgentBoardProps> = ({
  isLoading, isRunning, lastError, latestSummary, runs, triageItems,
  onRefresh, onRunDaily, onResolveTriage, onOpenTriageItem, opsKpis, captureKpis
}) => {
  const [mobilePane, setMobilePane] = useState<'command' | 'queue' | 'feed'>('command');
  const [timelineFilter, setTimelineFilter] = useState<'issues' | 'all' | 'success'>('issues');
  const [showCaptureDeepDive, setShowCaptureDeepDive] = useState(false);

  const runningRuns = useMemo(() => runs.filter((r) => r.status === 'STARTED'), [runs]);
  const failedRuns  = useMemo(() => runs.filter((r) => r.status === 'FAILED').slice(0, 6), [runs]);
  const successfulRuns = useMemo(() => runs.filter((r) => r.status === 'SUCCESS').slice(0, 6), [runs]);
  const latestRun = runs[0] ?? null;

  const queueSummary = useMemo(() => {
    const pendingAttention = failedRuns.length + triageItems.length;
    return {
      running: runningRuns.length,
      pendingAttention,
      healthy: pendingAttention === 0 && runningRuns.length === 0
    };
  }, [failedRuns.length, triageItems.length, runningRuns.length]);

  const topCards = useMemo(() => {
    const successRate = opsKpis?.automationSuccessRate7d;
    return [
      {
        label: 'Active Runs',
        value: String(queueSummary.running),
        hint: queueSummary.running > 0 ? 'Agent is executing now' : 'No run in progress',
        helpTh: 'จำนวนงานอัตโนมัติที่กำลังรันอยู่ตอนนี้',
        helpEn: 'How many automation jobs are actively running now.',
        tone: queueSummary.running > 0 ? 'text-amber-100 border-amber-400/35 bg-amber-500/10' : 'text-slate-100 border-slate-700 bg-slate-900/90'
      },
      {
        label: 'Needs Attention',
        value: String(queueSummary.pendingAttention),
        hint: queueSummary.pendingAttention > 0 ? 'Failed runs or triage backlog' : 'Queue is clear',
        helpTh: 'จำนวนปัญหาที่ต้องแก้ เช่น รันล้มเหลวหรือ triage ค้าง',
        helpEn: 'Items needing action: failed runs and pending triage.',
        tone: queueSummary.pendingAttention > 0 ? 'text-rose-100 border-rose-400/35 bg-rose-500/10' : 'text-emerald-100 border-emerald-400/35 bg-emerald-500/10'
      },
      {
        label: 'Latest Run',
        value: latestRun ? runTypeLabel(latestRun.runType) : '-',
        hint: latestRun ? `${latestRun.status} • ${formatDateTime(latestRun.startedAt)}` : 'No recent run',
        helpTh: 'งานรันล่าสุด พร้อมสถานะและเวลาเริ่ม',
        helpEn: 'Most recent run type, status, and start time.',
        tone: latestRun ? `text-slate-100 ${statusTone[latestRun.status]}` : 'text-slate-100 border-slate-700 bg-slate-900/90'
      },
      {
        label: 'Run Success 7d',
        value: successRate === undefined ? '-' : `${successRate.toFixed(1)}%`,
        hint: 'Rolling automation quality',
        helpTh: 'เปอร์เซ็นต์ความสำเร็จของการรันย้อนหลัง 7 วัน',
        helpEn: 'Seven-day success rate of automation runs.',
        tone: successRate !== undefined && successRate >= 85
          ? 'text-emerald-100 border-emerald-400/35 bg-emerald-500/10'
          : 'text-amber-100 border-amber-400/35 bg-amber-500/10'
      }
    ];
  }, [latestRun, opsKpis?.automationSuccessRate7d, queueSummary.pendingAttention, queueSummary.running]);

  const summaryDigest = useMemo(() => {
    if (!latestSummary?.contentMd) return [] as string[];
    const lines = latestSummary.contentMd.split('\n').map(cleanSummaryLine).filter(Boolean);
    const priorityLines = lines.filter(
      (line) =>
        /^[-*]\s+/.test(line) || /^\d+\./.test(line) ||
        /^(top|focus|priority|action|risk|next|today|plan|implement|follow|review|check)/i.test(line)
    );
    return (priorityLines.length ? priorityLines : lines)
      .slice(0, 7)
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s*/, '').trim())
      .filter((line) => line.length >= 12);
  }, [latestSummary]);

  const sharedQueueProps = { runningRuns, failedRuns, successfulRuns, triageItems, onResolveTriage, onOpenTriageItem };
  const sharedFeedProps = {
    isLoading, latestSummary, runs, triageItems, successfulRuns,
    timelineFilter, setTimelineFilter, onResolveTriage, onOpenTriageItem, summaryDigest
  };
  const sharedCommandProps = {
    isRunning, opsKpis, captureKpis, queueSummary,
    showCaptureDeepDive, setShowCaptureDeepDive, onRunDaily, onRefresh
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-3 md:p-4">
      {/* ── Header + KPI cards ── */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Mission Control</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
              <Bot className="h-5 w-5 text-cyan-200" />Agent Operations
            </h2>
            <p className="mt-1 text-sm text-slate-300">Operational cockpit for run orchestration, incident triage, and summary feed.</p>
            <HelpText
              th="ภาพรวมศูนย์ปฏิบัติการเอเจนต์ สำหรับสั่งงาน ติดตาม และแก้ปัญหา"
              en="Agent operations hub for execution, monitoring, and issue handling."
            />
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
            <Activity className="h-3.5 w-3.5 text-cyan-200" />
            {isRunning ? 'Daily run in progress' : 'Realtime monitoring active'}
          </div>
        </div>

        {lastError && (
          <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{lastError}</div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {topCards.map((card) => (
            <article key={card.label} className={`relative rounded-xl border p-3 ${card.tone}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-80">{card.label}</p>
              <p className="mt-1 text-lg font-semibold">{card.value}</p>
              <p className="mt-1 text-xs opacity-85">{card.hint}</p>
              <HelpText th={card.helpTh} en={card.helpEn} className="absolute right-2 top-2" />
            </article>
          ))}
        </div>

        {/* Mobile tab switcher */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs md:hidden">
          {(['command', 'queue', 'feed'] as const).map((pane) => (
            <button key={pane} onClick={() => setMobilePane(pane)}
              className={`rounded-lg border px-2 py-2 font-semibold ${mobilePane === pane ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
              {pane.charAt(0).toUpperCase() + pane.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop XL 3-col ── */}
      <div className="hidden xl:grid xl:h-[74vh] xl:grid-cols-[280px_minmax(0,1fr)_390px] xl:gap-4">
        <div className="min-h-0 overflow-y-auto pr-1"><CommandPane {...sharedCommandProps} /></div>
        <div className="min-h-0 overflow-y-auto pr-1"><QueuePane {...sharedQueueProps} /></div>
        <div className="min-h-0 overflow-y-auto pr-1"><FeedPane {...sharedFeedProps} /></div>
      </div>

      {/* ── Desktop MD 2-col ── */}
      <div className="hidden md:grid md:gap-4 xl:hidden">
        <div className="grid gap-4 lg:grid-cols-2">
          <CommandPane {...sharedCommandProps} />
          <QueuePane {...sharedQueueProps} />
        </div>
        <FeedPane {...sharedFeedProps} />
      </div>

      {/* ── Mobile ── */}
      <div className="space-y-4 md:hidden">
        {mobilePane === 'command' && <CommandPane {...sharedCommandProps} />}
        {mobilePane === 'queue' && <QueuePane {...sharedQueueProps} />}
        {mobilePane === 'feed' && <FeedPane {...sharedFeedProps} />}
      </div>
    </div>
  );
};
