import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { AgentRun, MemorySummary } from '../types';

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

export const useAgentData = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [summaries, setSummaries] = useState<MemorySummary[]>([]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLastError(null);
    try {
      const [runsRes, summariesRes] = await Promise.all([
        supabase.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(20),
        supabase.from('memory_summaries').select('*').eq('summary_type', 'DAILY').order('summary_date', { ascending: false }).limit(14)
      ]);
      if (runsRes.error) throw new Error(runsRes.error.message);
      if (summariesRes.error) throw new Error(summariesRes.error.message);

      setRuns((runsRes.data || []).map(fromRunDb));
      setSummaries((summariesRes.data || []).map(fromSummaryDb));
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
    latestSummary: summaries[0] || null,
    refresh,
    triggerDailyRun
  };
};
