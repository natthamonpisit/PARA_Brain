import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { AgentRun, MemorySummary } from '../types';

export interface CaptureKpis {
  totalToday: number;
  actionableToday: number;
  intentAccuracyProxy: number;
  duplicateSkipRate: number;
  pendingConfirmations: number;
  avgConfidence: number;
}

const fromRunDb = (row: any): AgentRun => ({
  id: row.id,
  runType: row.run_type,
  status: row.status,
  promptVersion: row.prompt_version,
  model: row.model,
  outputFile: row.output_file,
  errorText: row.error_text,
  metrics: row.metrics || {},
  startedAt: row.started_at,
  completedAt: row.completed_at
});

const fromSummaryDb = (row: any): MemorySummary => ({
  id: row.id,
  summaryType: row.summary_type,
  summaryDate: row.summary_date,
  title: row.title,
  contentMd: row.content_md,
  inputRefs: row.input_refs || [],
  createdBy: row.created_by,
  createdAt: row.created_at
});

const DEFAULT_CAPTURE_KPIS: CaptureKpis = {
  totalToday: 0,
  actionableToday: 0,
  intentAccuracyProxy: 0,
  duplicateSkipRate: 0,
  pendingConfirmations: 0,
  avgConfidence: 0
};

const parseCapturePayload = (value: any): any | null => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw.startsWith('{')) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const toPct = (num: number, den: number): number => {
  if (den <= 0) return 0;
  return (num / den) * 100;
};

const computeCaptureKpis = (rows: any[]): CaptureKpis => {
  if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_CAPTURE_KPIS;

  const captureRows = rows
    .map((row) => {
      const payload = parseCapturePayload(row.ai_response);
      return {
        row,
        payload
      };
    })
    .filter(({ row, payload }) => {
      const source = String(row?.event_source || '').toUpperCase();
      const fromCaptureSource = source === 'WEB' || source === 'TELEGRAM';
      const hasContract = payload?.contract === 'telegram_chat_v1';
      return fromCaptureSource || hasContract;
    });

  if (captureRows.length === 0) return DEFAULT_CAPTURE_KPIS;

  const actionableRows = captureRows.filter(({ payload }) => payload?.isActionable === true);
  const duplicateSkipped = captureRows.filter(({ row }) => {
    return String(row?.status || '').toUpperCase() === 'SKIPPED_DUPLICATE' || String(row?.action_type || '').toUpperCase() === 'SKIP_DUPLICATE';
  }).length;
  const pendingConfirmations = captureRows.filter(({ row }) => {
    return String(row?.action_type || '').toUpperCase() === 'NEEDS_CONFIRMATION' || String(row?.status || '').toUpperCase() === 'PENDING';
  }).length;
  const successfulActionable = actionableRows.filter(({ row }) => {
    const actionType = String(row?.action_type || '').toUpperCase();
    const status = String(row?.status || '').toUpperCase();
    if (actionType === 'ERROR') return false;
    return status === 'SUCCESS' || status === 'SKIPPED_DUPLICATE';
  }).length;

  const confidenceValues = captureRows
    .map(({ payload }) => Number(payload?.confidence))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1);
  const avgConfidence = confidenceValues.length
    ? confidenceValues.reduce((acc, n) => acc + n, 0) / confidenceValues.length
    : 0;

  return {
    totalToday: captureRows.length,
    actionableToday: actionableRows.length,
    intentAccuracyProxy: toPct(successfulActionable, actionableRows.length),
    duplicateSkipRate: toPct(duplicateSkipped, captureRows.length),
    pendingConfirmations,
    avgConfidence: avgConfidence * 100
  };
};

export const useAgentData = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [summaries, setSummaries] = useState<MemorySummary[]>([]);
  const [captureKpis, setCaptureKpis] = useState<CaptureKpis>(DEFAULT_CAPTURE_KPIS);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLastError(null);
    try {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const [runsRes, summariesRes, logsRes] = await Promise.all([
        supabase
          .from('agent_runs')
          .select('id,run_type,status,prompt_version,model,output_file,error_text,metrics,started_at,completed_at')
          .order('started_at', { ascending: false })
          .limit(12),
        supabase
          .from('memory_summaries')
          .select('id,summary_type,summary_date,title,content_md,input_refs,created_by,created_at')
          .eq('summary_type', 'DAILY')
          .order('summary_date', { ascending: false })
          .limit(7),
        supabase
          .from('system_logs')
          .select('id,event_source,action_type,status,ai_response,created_at')
          .gte('created_at', dayStart.toISOString())
          .order('created_at', { ascending: false })
          .limit(300)
      ]);
      if (runsRes.error) throw new Error(runsRes.error.message);
      if (summariesRes.error) throw new Error(summariesRes.error.message);

      setRuns((runsRes.data || []).map(fromRunDb));
      setSummaries((summariesRes.data || []).map(fromSummaryDb));
      if (logsRes.error) {
        console.warn('[useAgentData] capture KPI query failed:', logsRes.error.message);
        setCaptureKpis(DEFAULT_CAPTURE_KPIS);
      } else {
        setCaptureKpis(computeCaptureKpis(logsRes.data || []));
      }
    } catch (e: any) {
      setLastError(e.message || 'Failed to load agent data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const triggerDailyRun = useCallback(async (opts?: { force?: boolean; dryRun?: boolean }) => {
    setIsRunning(true);
    setLastError(null);
    try {
      // Optional local/dev key passthrough when API is protected by CRON_SECRET.
      // Do not set VITE_CRON_SECRET in public production builds.
      const maybeCronKey = (import.meta as any)?.env?.VITE_CRON_SECRET || '';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch('/api/agent-daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(maybeCronKey ? { 'x-cron-key': maybeCronKey } : {})
        },
        body: JSON.stringify({
          force: !!opts?.force,
          dryRun: !!opts?.dryRun
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body.error || `Run failed (${res.status})`;
        if (res.status === 401) {
          throw new Error(`${msg} Set ALLOW_AGENT_UI_TRIGGER=true or provide x-cron-key.`);
        }
        if (res.status === 500 && String(msg).includes('Missing server configuration')) {
          throw new Error(`${msg} Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY/VITE_GEMINI_API_KEY.`);
        }
        const enriched = body.retryable ? `${msg} You can retry with force run.` : msg;
        throw new Error(enriched);
      }
      await refresh();
      return body;
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Run timed out after 120s. Try again.' : (e.message || 'Failed to run daily agent');
      setLastError(msg);
      throw e;
    } finally {
      setIsRunning(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isLoading,
    isRunning,
    lastError,
    runs,
    summaries,
    captureKpis,
    latestSummary: summaries[0] || null,
    refresh,
    triggerDailyRun
  };
};
