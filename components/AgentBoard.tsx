import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentRun, MemorySummary, ParaItem, ParaType } from '../types';
import type { CaptureKpis } from '../hooks/useAgentData';
import {
  Activity,
  AlertTriangle,
  Bot,
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
  captureKpis?: CaptureKpis;
}

const statusTone: Record<AgentRun['status'], string> = {
  STARTED: 'border-amber-400/45 bg-amber-500/10 text-amber-100',
  SUCCESS: 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100',
  FAILED: 'border-rose-400/45 bg-rose-500/10 text-rose-100'
};

const runTypeLabel = (runType: AgentRun['runType']) => runType.replaceAll('_', ' ');

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const cleanSummaryLine = (line: string) =>
  line
    .replace(/\[[0-9a-f]{8}-[0-9a-f-]{20,}\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const HelpText: React.FC<{ th: string; en: string; className?: string }> = ({ th, en, className }) => (
  <p className={`mt-1 text-[10px] leading-snug text-slate-400 ${className || ''}`}>
    <span className="font-semibold text-slate-300">TH:</span> {th}
    <span className="mx-1 text-slate-500">|</span>
    <span className="font-semibold text-slate-300">EN:</span> {en}
  </p>
);

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
  opsKpis,
  captureKpis
}) => {
  const [mobilePane, setMobilePane] = useState<'command' | 'queue' | 'feed'>('command');
  const [timelineFilter, setTimelineFilter] = useState<'issues' | 'all' | 'success'>('issues');

  const runningRuns = useMemo(() => runs.filter((r) => r.status === 'STARTED'), [runs]);
  const failedRuns = useMemo(() => runs.filter((r) => r.status === 'FAILED').slice(0, 6), [runs]);
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

  const timeline = useMemo(() => runs.slice(0, 10), [runs]);
  const staleRunThresholdMs = 45 * 60 * 1000;

  const isStaleStartedRun = (run: AgentRun) =>
    run.status === 'STARTED' && Date.now() - new Date(run.startedAt).getTime() > staleRunThresholdMs;

  const issueRuns = useMemo(
    () => runs.filter((run) => run.status === 'FAILED' || isStaleStartedRun(run)).slice(0, 8),
    [runs]
  );

  const historyRuns = useMemo(() => {
    if (timelineFilter === 'success') {
      return timeline.filter((run) => run.status === 'SUCCESS');
    }
    if (timelineFilter === 'issues') {
      return timeline.filter((run) => run.status === 'FAILED' || isStaleStartedRun(run));
    }
    return timeline;
  }, [timeline, timelineFilter]);

  const summaryDigest = useMemo(() => {
    if (!latestSummary?.contentMd) return [] as string[];

    const lines = latestSummary.contentMd
      .split('\n')
      .map(cleanSummaryLine)
      .filter(Boolean);

    const priorityLines = lines.filter(
      (line) =>
        /^[-*]\s+/.test(line) ||
        /^\d+\./.test(line) ||
        /^(top|focus|priority|action|risk|next|today|plan|implement|follow|review|check)/i.test(line)
    );

    const selected = (priorityLines.length ? priorityLines : lines)
      .slice(0, 7)
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s*/, '').trim())
      .filter((line) => line.length >= 12);

    return selected;
  }, [latestSummary]);

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

  const renderCommandPane = () => (
    <div className="space-y-4">
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
        <HelpText
          th="ปุ่มสั่งรัน รีเฟรช และบังคับรันเมื่อจำเป็น"
          en="Action buttons to run, refresh, and force-run workflows."
        />
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
            <button
              onClick={onRefresh}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={() => onRunDaily({ force: true })}
              disabled={isRunning}
              className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AlertTriangle className="h-4 w-4" />
              Force Run
            </button>
          </div>
        </div>
      </section>

      {opsKpis && (
        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Operational Pulse</p>
          <HelpText
            th="ตัวชี้วัดสุขภาพระบบและภาระงานที่ต้องดูทันที"
            en="Health KPIs showing current operational load and risk."
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Overdue Tasks</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{opsKpis.overdueTasks}</p>
              <HelpText th="งานที่เลยกำหนดและยังไม่ปิด" en="Tasks past due date that are still open." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Triage Pending</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{opsKpis.triagePending}</p>
              <HelpText th="รายการที่ยังรอจัดประเภท" en="Items waiting to be classified and routed." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Net 30d</p>
              <p className={`mt-1 text-lg font-semibold ${opsKpis.net30d >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                {opsKpis.net30d.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
              <HelpText th="ผลรวมรายรับ-รายจ่ายย้อนหลัง 30 วัน" en="30-day net amount from income and expense flow." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Run Success 7d</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{opsKpis.automationSuccessRate7d.toFixed(1)}%</p>
              <HelpText th="ความน่าเชื่อถือของระบบรันอัตโนมัติ" en="Reliability percentage of automation executions." />
            </div>
          </div>
        </section>
      )}

      {captureKpis && (
        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Capture Intelligence</p>
          <HelpText
            th="วัดคุณภาพการจับข้อความและการตีความ intent ของ AI"
            en="KPIs for capture quality, intent parsing, and confidence."
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Captured Today</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{captureKpis.totalToday}</p>
              <HelpText th="ข้อความที่ถูกบันทึกเข้าระบบวันนี้" en="Total captured inputs stored today." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Actionable Today</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{captureKpis.actionableToday}</p>
              <HelpText th="รายการที่แปลงเป็นงานได้จริงวันนี้" en="Captured inputs that became actionable items today." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Intent Accuracy (Proxy)</p>
              <p className="mt-1 text-lg font-semibold text-cyan-100">{captureKpis.intentAccuracyProxy.toFixed(1)}%</p>
              <HelpText th="ค่าประมาณความแม่นยำการเข้าใจเจตนา" en="Proxy estimate of AI intent classification accuracy." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Duplicate Skip Rate</p>
              <p className="mt-1 text-lg font-semibold text-amber-100">{captureKpis.duplicateSkipRate.toFixed(1)}%</p>
              <HelpText th="สัดส่วนที่ระบบข้ามรายการซ้ำได้สำเร็จ" en="Rate at which duplicate captures were skipped." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Pending Confirm</p>
              <p className="mt-1 text-lg font-semibold text-rose-100">{captureKpis.pendingConfirmations}</p>
              <HelpText th="รายการที่รอผู้ใช้ยืนยันก่อนสร้างจริง" en="Items waiting user confirmation before creation." />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
              <p className="text-[11px] text-slate-400">Avg Confidence</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{captureKpis.avgConfidence.toFixed(1)}%</p>
              <HelpText th="ค่าเฉลี่ยความมั่นใจของ AI ในการวิเคราะห์" en="Average AI confidence across captured analyses." />
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
          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Running</p>
              <span className="text-xs text-slate-400">{runningRuns.length}</span>
            </div>
            <HelpText
              th="งานที่กำลังรันอยู่แบบเรียลไทม์"
              en="Runs currently executing in real time."
              className="mb-2"
            />
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

          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-100">Needs Attention</p>
              <span className="text-xs text-slate-400">{failedRuns.length + triageItems.length}</span>
            </div>
            <HelpText
              th="รายการผิดพลาดหรือ triage ที่ต้องตัดสินใจ"
              en="Failures and triage items that need decision/action."
              className="mb-2"
            />
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
                  <HelpText
                    th="ข้อความที่ยังไม่ชัดว่าควรเป็น Task หรือ Project"
                    en="Unresolved capture waiting Task/Project classification."
                    className="opacity-95"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => onResolveTriage(item.id, ParaType.TASK)}
                      className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
                    >
                      Task
                    </button>
                    <button
                      onClick={() => onResolveTriage(item.id, ParaType.PROJECT)}
                      className="rounded-md border border-blue-400/50 bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-100 hover:bg-blue-500/20"
                    >
                      Project
                    </button>
                    <button
                      onClick={() => onOpenTriageItem(item.id)}
                      className="rounded-md border border-slate-500/70 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                    >
                      Open
                    </button>
                  </div>
                </article>
              ))}

              {failedRuns.length === 0 && triageItems.length === 0 && (
                <p className="text-sm text-slate-400">No blockers in queue.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Recent Success</p>
              <span className="text-xs text-slate-400">{successfulRuns.length}</span>
            </div>
            <HelpText
              th="งานที่รันสำเร็จล่าสุด ใช้เช็คเสถียรภาพระบบ"
              en="Most recent successful runs for stability checks."
              className="mb-2"
            />
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

  const renderFeedPane = () => (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Live Feed</p>
            <h4 className="mt-1 text-base font-semibold text-slate-50">Latest Summary</h4>
            <HelpText
              th="สรุปสถานะล่าสุดจากเอเจนต์ เพื่ออ่านภาพรวมไวๆ"
              en="Latest agent summary for quick situational understanding."
            />
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
                <HelpText
                  th="หัวข้อและวันที่ของสรุปล่าสุด"
                  en="Title and date of the latest generated summary."
                  className="text-cyan-100/90"
                />
              </header>

              {summaryDigest.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Quick Read</p>
                  <ul className="space-y-2">
                    {summaryDigest.map((line, idx) => (
                      <li key={`${idx}-${line.slice(0, 20)}`} className="rounded-md border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-slate-200">
                        {line}
                        <HelpText
                          th="ประเด็นสำคัญที่ AI คัดมาให้อ่านก่อน"
                          en="High-priority summary point extracted for fast reading."
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Open full markdown</summary>
                <HelpText
                  th="กดเพื่อเปิดสรุปฉบับเต็มแบบ markdown"
                  en="Expand to read the full markdown summary."
                />
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

      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Exception Feed</p>
            <p className="mt-1 text-sm text-slate-300">Show only blockers and unstable runs first.</p>
            <HelpText
              th="แสดงเฉพาะปัญหาสำคัญและงานที่ต้องรีบตัดสินใจ"
              en="Prioritized feed for blockers and urgent interventions."
            />
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
            <p className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              No active blockers. System looks stable.
            </p>
          )}

          {issueRuns.map((run) => {
            const isStale = isStaleStartedRun(run);
            return (
              <article
                key={run.id}
                className={`rounded-xl border p-3 ${
                  run.status === 'FAILED'
                    ? 'border-rose-400/45 bg-rose-500/10'
                    : isStale
                      ? 'border-amber-400/45 bg-amber-500/10'
                      : 'border-slate-700 bg-slate-900/95'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{runTypeLabel(run.runType)}</p>
                  {run.status === 'FAILED' ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">FAILED</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">STALE RUN</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-300">Started {formatDateTime(run.startedAt)}</p>
                {run.errorText && <p className="mt-1 line-clamp-2 text-xs text-rose-100">{run.errorText}</p>}
                <HelpText
                  th="การ์ดแจ้งเตือนเหตุผิดปกติจากระบบรัน"
                  en="Exception card for failed or potentially stuck run."
                />
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
                <button
                  onClick={() => onResolveTriage(item.id, ParaType.TASK)}
                  className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
                >
                  Task
                </button>
                <button
                  onClick={() => onResolveTriage(item.id, ParaType.PROJECT)}
                  className="rounded-md border border-blue-400/50 bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-100 hover:bg-blue-500/20"
                >
                  Project
                </button>
                <button
                  onClick={() => onOpenTriageItem(item.id)}
                  className="rounded-md border border-slate-500/70 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                >
                  Open
                </button>
              </div>
              <HelpText
                th="การ์ด triage สำหรับจัดประเภทหรือเปิดดูรายละเอียด"
                en="Triage card to classify item or open full detail."
              />
            </article>
          ))}
        </div>

        <details className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
            View Full Run History ({timeline.length})
          </summary>
          <HelpText
            th="เปิดประวัติการรันย้อนหลัง พร้อมกรองประเภทเหตุการณ์"
            en="Expand to inspect historical runs with status filters."
          />
          <div className="mt-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                onClick={() => setTimelineFilter('issues')}
                className={`rounded-md border px-2 py-1.5 font-semibold ${
                  timelineFilter === 'issues'
                    ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                Issues
              </button>
              <button
                onClick={() => setTimelineFilter('all')}
                className={`rounded-md border px-2 py-1.5 font-semibold ${
                  timelineFilter === 'all'
                    ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTimelineFilter('success')}
                className={`rounded-md border px-2 py-1.5 font-semibold ${
                  timelineFilter === 'success'
                    ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                Success
              </button>
            </div>

            <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {historyRuns.length === 0 && <p className="text-sm text-slate-300">No runs for this filter.</p>}
              {historyRuns.map((run) => {
                const isStale = isStaleStartedRun(run);
                return (
                  <article key={run.id} className="rounded-lg border border-slate-700 bg-slate-900/95 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-100">{runTypeLabel(run.runType)}</p>
                      {run.status === 'FAILED' ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">FAILED</span>
                      ) : run.status === 'SUCCESS' ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">SUCCESS</span>
                      ) : isStale ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">STALE</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">STARTED</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Start {formatDateTime(run.startedAt)}</p>
                    {run.completedAt && <p className="text-[11px] text-slate-400">End {formatDateTime(run.completedAt)}</p>}
                    {run.errorText && <p className="mt-1 line-clamp-2 text-[11px] text-rose-200">{run.errorText}</p>}
                    <HelpText
                      th="บันทึกการรันหนึ่งรายการในประวัติย้อนหลัง"
                      en="Single historical run entry with status and timing."
                    />
                  </article>
                );
              })}
            </div>
          </div>
        </details>
      </section>
    </div>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-3 md:p-4">
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Mission Control</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
              <Bot className="h-5 w-5 text-cyan-200" />
              Agent Operations
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
          <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {lastError}
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {topCards.map((card) => (
            <article key={card.label} className={`rounded-xl border p-3 ${card.tone}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-80">{card.label}</p>
              <p className="mt-1 text-lg font-semibold">{card.value}</p>
              <p className="mt-1 text-xs opacity-85">{card.hint}</p>
              <HelpText th={card.helpTh} en={card.helpEn} className="opacity-95" />
            </article>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs md:hidden">
          <button
            onClick={() => setMobilePane('command')}
            className={`rounded-lg border px-2 py-2 font-semibold ${mobilePane === 'command' ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            Command
          </button>
          <button
            onClick={() => setMobilePane('queue')}
            className={`rounded-lg border px-2 py-2 font-semibold ${mobilePane === 'queue' ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            Queue
          </button>
          <button
            onClick={() => setMobilePane('feed')}
            className={`rounded-lg border px-2 py-2 font-semibold ${mobilePane === 'feed' ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            Feed
          </button>
        </div>
      </div>

      <div className="hidden xl:grid xl:grid-cols-[300px_minmax(0,1fr)_420px] xl:gap-4">
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
