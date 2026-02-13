import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadLocalEnv() {
  const root = process.cwd();
  loadEnvFromFile(path.join(root, '.env.local'));
  loadEnvFromFile(path.join(root, '.env'));
}

function dateInTimeZone(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export async function runHeartbeat(options = {}) {
  const supabaseUrl = options.supabaseUrl || process.env.VITE_SUPABASE_URL;
  const serviceRole = options.serviceRole || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const timezone = options.timezone || process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok';
  if (!supabaseUrl || !serviceRole) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const today = dateInTimeZone(timezone, now);
  const nowIso = now.toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stuckSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [todaySummaryRes, failedRunsRes, stuckRunsRes, overdueTasksRes, triageTasksRes] = await Promise.all([
    db.from('memory_summaries').select('id,summary_date').eq('summary_type', 'DAILY').eq('summary_date', today).maybeSingle(),
    db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('run_type', 'DAILY_BRIEF').eq('status', 'FAILED').gte('started_at', since24h),
    db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('run_type', 'DAILY_BRIEF').eq('status', 'STARTED').lte('started_at', stuckSince),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('is_completed', false).not('due_date', 'is', null).lt('due_date', nowIso),
    db.from('tasks').select('id', { count: 'exact', head: true }).contains('tags', ['triage-pending'])
  ]);

  for (const res of [todaySummaryRes, failedRunsRes, stuckRunsRes, overdueTasksRes, triageTasksRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const checks = [
    {
      key: 'daily_summary_freshness',
      status: todaySummaryRes.data ? 'PASS' : 'WARN',
      detail: todaySummaryRes.data ? `Summary exists for ${today}` : `No daily summary for ${today}`
    },
    {
      key: 'agent_run_failures_24h',
      status: (failedRunsRes.count || 0) > 0 ? 'WARN' : 'PASS',
      detail: `failed_runs_24h=${failedRunsRes.count || 0}`
    },
    {
      key: 'agent_run_stuck',
      status: (stuckRunsRes.count || 0) > 0 ? 'WARN' : 'PASS',
      detail: `stuck_runs=${stuckRunsRes.count || 0}`
    },
    {
      key: 'overdue_tasks',
      status: (overdueTasksRes.count || 0) > 10 ? 'WARN' : 'PASS',
      detail: `overdue_tasks=${overdueTasksRes.count || 0}`
    },
    {
      key: 'triage_backlog',
      status: (triageTasksRes.count || 0) > 15 ? 'WARN' : 'PASS',
      detail: `triage_pending=${triageTasksRes.count || 0}`
    }
  ];

  const overall = checks.some((c) => c.status === 'WARN') ? 'WARN' : 'PASS';
  const report = [
    `# Heartbeat - ${today}`,
    '',
    `- Generated At: ${nowIso}`,
    `- Timezone: ${timezone}`,
    `- Overall: ${overall}`,
    '',
    '## Checks',
    ...checks.map((c) => `- [${c.status}] ${c.key}: ${c.detail}`)
  ].join('\n');

  const outputDir = path.join(process.cwd(), 'memory', 'heartbeat');
  const outputFile = path.join(outputDir, `heartbeat-${today}.md`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, report);

  return { today, timezone, overall, checks, outputFile };
}

async function main() {
  loadLocalEnv();
  const result = await runHeartbeat({});
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[heartbeat] failed: ${err.message}`);
    process.exit(1);
  });
}
