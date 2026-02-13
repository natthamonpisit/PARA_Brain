import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function parseSampleSets(args) {
  const sampleArg = args.find((item) => item.startsWith('--samples='));
  const raw = sampleArg ? sampleArg.split('=')[1] : '50,100';
  const values = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value >= 3);
  return Array.from(new Set(values));
}

function runSingleBenchmark(sampleCount) {
  const run = spawnSync('node', ['scripts/benchmark_retrieval_indexes.mjs', `--samples=${sampleCount}`], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env
  });
  if (run.status !== 0) {
    throw new Error(`benchmark_retrieval_indexes failed for samples=${sampleCount}`);
  }

  const latestPath = path.join(process.cwd(), 'docs', 'benchmarks', 'latest_vector_benchmark.json');
  if (!fs.existsSync(latestPath)) {
    throw new Error(`Missing benchmark output: ${latestPath}`);
  }
  return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
}

function buildSummary(runs) {
  const winnerCount = runs.reduce(
    (acc, run) => {
      const winner = String(run?.winner_by_avg_latency || 'tie');
      if (winner === 'hnsw') acc.hnsw += 1;
      else if (winner === 'ivfflat') acc.ivfflat += 1;
      else acc.tie += 1;
      return acc;
    },
    { hnsw: 0, ivfflat: 0, tie: 0 }
  );
  const recommendation =
    winnerCount.hnsw > winnerCount.ivfflat
      ? 'hnsw'
      : winnerCount.ivfflat > winnerCount.hnsw
      ? 'ivfflat'
      : 'tie';
  return {
    generated_at: new Date().toISOString(),
    runs,
    winner_counts: winnerCount,
    recommendation
  };
}

async function main() {
  const sampleSets = parseSampleSets(process.argv.slice(2));
  if (sampleSets.length === 0) {
    throw new Error('No valid sample set. Use --samples=50,100');
  }

  const runs = [];
  for (const sampleCount of sampleSets) {
    console.log(`[matrix] running benchmark for samples=${sampleCount}`);
    const result = runSingleBenchmark(sampleCount);
    runs.push(result);
  }

  const summary = buildSummary(runs);
  const outDir = path.join(process.cwd(), 'docs', 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'latest_vector_benchmark_matrix.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('[matrix] done');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`[matrix] failed: ${error.message}`);
  process.exit(1);
});
