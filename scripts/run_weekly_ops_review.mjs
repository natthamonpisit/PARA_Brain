import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { ROUTING_RULES_VERSION, summarizeAreaCoverage } from '../shared/routingRules.js';

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

function fmtMoney(n) {
  const v = Number(n || 0);
  return `${v >= 0 ? '+' : '-'}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export async function runWeeklyOpsReview(options = {}) {
  const supabaseUrl = options.supabaseUrl || process.env.VITE_SUPABASE_URL;
  const serviceRole = options.serviceRole || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const timezone = options.timezone || process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok';
  if (!supabaseUrl || !serviceRole) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const now = new Date();
  const today = dateInTimeZone(timezone, now);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();

  const [historyRes, tasksRes, projectsRes, areasRes, txRes, runRes, extRes] = await Promise.all([
    db.from('history').select('*').gte('timestamp', since7d).order('timestamp', { ascending: false }),
    db.from('tasks').select('*'),
    db.from('projects').select('*'),
    db.from('areas').select('*'),
    db.from('transactions').select('*').gte('transaction_date', since30d),
    db.from('agent_runs').select('*').gte('started_at', since7d),
    db.from('external_agent_jobs').select('*').gte('requested_at', since7d)
  ]);

  for (const r of [historyRes, tasksRes, projectsRes, areasRes, txRes, runRes, extRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const history = historyRes.data || [];
  const tasks = tasksRes.data || [];
  const projects = projectsRes.data || [];
  const areas = areasRes.data || [];
  const txs = txRes.data || [];
  const runs = runRes.data || [];
  const extJobs = extRes.data || [];
  const routingCoverage = summarizeAreaCoverage(areas);

  const completed7d = history.filter((h) => h.action === 'COMPLETE').length;
  const created7d = history.filter((h) => h.action === 'CREATE').length;
  const overdue = tasks.filter((t) => !t.is_completed && t.due_date && t.due_date < now.toISOString());
  const staleProjects = projects.filter((p) => (p.updated_at || p.created_at || '') < staleBefore);
  const triagePending = tasks.filter((t) => Array.isArray(t.tags) && t.tags.includes('triage-pending')).length;

  let income = 0;
  let expense = 0;
  const expCat = {};
  for (const t of txs) {
    if (t.type === 'INCOME') income += Number(t.amount || 0);
    if (t.type === 'EXPENSE') {
      const amt = Number(t.amount || 0);
      expense += amt;
      const k = t.category || 'General';
      expCat[k] = (expCat[k] || 0) + amt;
    }
  }
  const net30d = income - expense;
  const topExpenseCats = Object.entries(expCat)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([k, v]) => `${k} (${fmtMoney(-Number(v))})`);

  const runTotal = runs.length || 0;
  const runSuccess = runs.filter((r) => r.status === 'SUCCESS').length;
  const runFail = runs.filter((r) => r.status === 'FAILED').length;
  const runSuccessRate = runTotal ? (runSuccess / runTotal) * 100 : 0;

  const extDone = extJobs.filter((j) => j.status === 'DONE').length;
  const extFailed = extJobs.filter((j) => j.status === 'FAILED').length;

  const weekLabel = `${dateInTimeZone(timezone, new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))} to ${today}`;
  const title = `Weekly Review - ${weekLabel}`;
  const md = [
    `# ${title}`,
    '',
    '## Wins',
    `- Completed actions (7d): ${completed7d}`,
    `- Agent run success rate (7d): ${runSuccessRate.toFixed(1)}% (${runSuccess}/${runTotal})`,
    `- External agent jobs done (7d): ${extDone}`,
    '',
    '## Incomplete Work',
    `- Overdue tasks: ${overdue.length}`,
    `- Triage pending tasks: ${triagePending}`,
    '',
    '## Stale Projects',
    ...(staleProjects.slice(0, 5).map((p) => `- ${p.title || p.id}`)),
    ...(staleProjects.length === 0 ? ['- None'] : []),
    '',
    '## Orphan Tasks/Resources',
    '- (Phase G placeholder) Add orphan detector in next cycle',
    '',
    '## Next Week Focus',
    `- Keep overdue tasks under 10 (current ${overdue.length})`,
    `- Improve agent success rate above 95% (current ${runSuccessRate.toFixed(1)}%)`,
    `- Review top expense categories: ${topExpenseCats.join(', ') || 'n/a'}`,
    '',
    '## Financial Snapshot (30d)',
    `- Income: ${fmtMoney(income)}`,
    `- Expense: ${fmtMoney(-expense)}`,
    `- Net: ${fmtMoney(net30d)}`,
    `- Top expense categories: ${topExpenseCats.join(', ') || 'n/a'}`,
    '',
    '## Automation KPI (7d)',
    `- Agent runs: total=${runTotal}, success=${runSuccess}, failed=${runFail}`,
    `- External jobs: done=${extDone}, failed=${extFailed}`,
    '',
    '## Source References',
    '- history, tasks, projects, areas, transactions, agent_runs, external_agent_jobs',
    '',
    '## Routing Rule Baseline',
    `- Routing rules version: ${ROUTING_RULES_VERSION}`,
    `- Core areas coverage: ${routingCoverage.matchedConfigured}/${routingCoverage.totalConfigured}`,
    `- Missing core areas: ${routingCoverage.missingCanonicalNames.join(', ') || 'None'}`,
    `- Unknown custom areas: ${routingCoverage.unknownAreaNames.join(', ') || 'None'}`
  ].join('\n');

  const outputDir = path.join(process.cwd(), 'memory', 'weekly');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `weekly-${today}.md`);
  fs.writeFileSync(outputFile, md);

  const { error: upsertErr } = await db.from('memory_summaries').upsert({
    summary_type: 'WEEKLY',
    summary_date: today,
    title,
    content_md: md,
    input_refs: [
      { source: 'history', since: since7d },
      { source: 'transactions', since: since30d },
      { source: 'agent_runs', since: since7d },
      { source: 'external_agent_jobs', since: since7d }
    ],
    created_by: 'agent'
  });
  if (upsertErr) throw new Error(upsertErr.message);

  return {
    today,
    weekLabel,
    outputFile,
    kpis: {
      completed7d,
      overdueTasks: overdue.length,
      triagePending,
      income30d: income,
      expense30d: expense,
      net30d,
      runSuccessRate,
      extDone,
      extFailed,
      routingCoverage
    }
  };
}

async function main() {
  loadLocalEnv();
  const result = await runWeeklyOpsReview({});
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[weekly] failed: ${err.message}`);
    process.exit(1);
  });
}
