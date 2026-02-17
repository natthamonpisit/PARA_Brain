import fs from 'fs';
import path from 'path';
import { runDailyBrief } from './lib/agent_daily_core.mjs';

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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

async function main() {
  loadLocalEnv();

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const dateArg = [...args].find((x) => x.startsWith('--date=')) || '';
  const runDate = dateArg ? dateArg.split('=')[1] : undefined;

  const result = await runDailyBrief({
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
    model: process.env.AGENT_MODEL || 'gemini-2.0-flash',
    ownerKey: process.env.AGENT_OWNER_KEY || 'default',
    runDate,
    dryRun,
    writeFile: true
  });

  console.log(`[agent] success run_id=${result.runId} output=${result.outputFile || '(none)'} dry_run=${dryRun}`);
}

main().catch((err) => {
  console.error(`[agent] failed: ${err.message}`);
  process.exit(1);
});
