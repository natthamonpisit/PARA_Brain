import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

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

function pgEnvFromDatabaseUrl(databaseUrl) {
  const u = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: (u.pathname || '/postgres').replace(/^\//, '') || 'postgres',
    PGSSLMODE: 'require',
    PGOPTIONS: '-c maintenance_work_mem=256MB'
  };
}

function psqlQuery(pgEnv, sql) {
  const r = spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env: pgEnv,
    encoding: 'utf8'
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'psql query failed').trim());
  }
  return (r.stdout || '').trim();
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function extractExecutionTimeMs(explainJsonText) {
  const arr = JSON.parse(explainJsonText);
  const root = Array.isArray(arr) ? arr[0] : arr;
  return Number(root['Execution Time'] || 0);
}

async function main() {
  loadLocalEnv();

  const args = process.argv.slice(2);
  const samplesArg = args.find((a) => a.startsWith('--samples='));
  const sampleCount = samplesArg ? Number(samplesArg.split('=')[1]) : 12;
  if (!sampleCount || sampleCount < 3) {
    throw new Error('Invalid sample count. Use --samples=12 (>=3).');
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DB_URL;
  if (!databaseUrl) throw new Error('Missing DATABASE_URL/SUPABASE_DB_URL/DB_URL');
  const pgEnv = pgEnvFromDatabaseUrl(databaseUrl);

  const tableName = `benchmark_memory_chunks_${Date.now()}`;
  const queryTable = `${tableName}_queries`;

  const runCase = (name, createIndexSql, sampleTotal) => {
    console.log(`[bench] case=${name} create index`);
    psqlQuery(pgEnv, `drop index if exists ${tableName}_ivf_idx;`);
    psqlQuery(pgEnv, `drop index if exists ${tableName}_hnsw_idx;`);
    psqlQuery(pgEnv, createIndexSql);
    psqlQuery(pgEnv, `analyze ${tableName};`);

    const times = [];
    for (let sampleIndex = 0; sampleIndex < sampleTotal; sampleIndex += 1) {
      const explainOut = psqlQuery(
        pgEnv,
        `explain (analyze, format json)
         select id
         from ${tableName}
         order by embedding <=> (
           select embedding from ${queryTable} offset ${sampleIndex} limit 1
         )
         limit 8;`
      );
      times.push(extractExecutionTimeMs(explainOut));
    }

    return {
      name,
      samples: times.length,
      avg_ms: Number(avg(times).toFixed(3)),
      p50_ms: Number(percentile(times, 50).toFixed(3)),
      p95_ms: Number(percentile(times, 95).toFixed(3)),
      min_ms: Number(Math.min(...times).toFixed(3)),
      max_ms: Number(Math.max(...times).toFixed(3))
    };
  };
  let rowCount = 0;
  try {
    console.log(`[bench] setup table=${tableName}`);
    psqlQuery(pgEnv, `create table ${tableName} as select id, embedding from memory_chunks where embedding is not null;`);
    psqlQuery(pgEnv, `create table ${queryTable} as select embedding from ${tableName} order by random() limit ${sampleCount};`);
    const countOut = psqlQuery(pgEnv, `select count(*) from ${tableName};`);
    rowCount = Number(countOut || 0);
    if (rowCount < sampleCount) {
      throw new Error(`Not enough embedded rows for benchmark (${rowCount} found, ${sampleCount} requested).`);
    }

    const adaptiveLists = Math.max(1, Math.min(100, Math.floor(rowCount / 1000)));
    const ivf = runCase(
      'ivfflat',
      `create index ${tableName}_ivf_idx on ${tableName} using ivfflat (embedding vector_cosine_ops) with (lists = ${adaptiveLists});`,
      sampleCount
    );
    const hnsw = runCase(
      'hnsw',
      `create index ${tableName}_hnsw_idx on ${tableName} using hnsw (embedding vector_cosine_ops);`,
      sampleCount
    );

    const better = ivf.avg_ms === hnsw.avg_ms ? 'tie' : (ivf.avg_ms < hnsw.avg_ms ? 'ivfflat' : 'hnsw');
    const summary = {
      generated_at: new Date().toISOString(),
      samples: sampleCount,
      source_rows: rowCount,
      ivfflat: ivf,
      hnsw,
      winner_by_avg_latency: better
    };

    const outDir = path.join(process.cwd(), 'docs', 'benchmarks');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'latest_vector_benchmark.json'), JSON.stringify(summary, null, 2));

    console.log('[bench] done');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    try { psqlQuery(pgEnv, `drop table if exists ${queryTable};`); } catch {}
    try { psqlQuery(pgEnv, `drop table if exists ${tableName};`); } catch {}
  }
}

main().catch((err) => {
  console.error(`[bench] failed: ${err.message}`);
  process.exit(1);
});
