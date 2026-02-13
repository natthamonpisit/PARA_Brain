import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { runWithRetry } from './network_policy.mjs';

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

function getJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function compactItem(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    status: item.status || null,
    due_date: item.due_date || null,
    deadline: item.deadline || null,
    is_completed: item.is_completed || false,
    updated_at: item.updated_at || item.created_at || null
  };
}

function buildRetrievalQuery(todayItems, recentLogs, profile) {
  const titles = (todayItems || [])
    .map((t) => t.title)
    .filter(Boolean)
    .slice(0, 8)
    .join(', ');
  const logTitles = (recentLogs || [])
    .map((l) => l.item_title)
    .filter(Boolean)
    .slice(0, 6)
    .join(', ');
  const goals = (profile?.goals || []).slice(0, 4).join(', ');
  return `Daily planning context: ${titles}. Recent actions: ${logTitles}. Goals: ${goals}.`;
}

function ensureHeadings(md, dateStr) {
  const required = [
    `# Daily Brief - ${dateStr}`,
    '## Top 3 Priorities',
    '## Must-Do Today',
    '## Risks and Blockers',
    '## Suggested Actions (Need Confirmation)',
    '## Memory Highlights',
    '## Source References'
  ];
  const missing = required.filter((h) => !md.includes(h));
  if (missing.length === 0) return md;
  return [
    `# Daily Brief - ${dateStr}`,
    '',
    '## Top 3 Priorities',
    '- Context missing for robust prioritization',
    '-',
    '-',
    '',
    '## Must-Do Today',
    '- Fill missing data sources and rerun',
    '',
    '## Risks and Blockers',
    `- Missing required headings in model output: ${missing.join(', ')}`,
    '',
    '## Suggested Actions (Need Confirmation)',
    '- [ ] Re-run with richer context',
    '',
    '## Memory Highlights',
    '- Model output did not meet strict output contract',
    '',
    '## Source References',
    '- system: fallback-template'
  ].join('\n');
}

async function embedQuery(ai, text, preferredModel) {
  const candidates = [preferredModel, 'gemini-embedding-001', 'text-embedding-004'].filter(Boolean);
  let lastError = null;

  for (const model of [...new Set(candidates)]) {
    try {
      const response = await runWithRetry(() => ai.models.embedContent({
        model,
        contents: [text],
        config: { outputDimensionality: 1536 }
      }));
      const values = response?.embeddings?.[0]?.values || response?.embeddings?.[0]?.embedding?.values;
      if (!Array.isArray(values) || values.length !== 1536) {
        throw new Error('Failed to generate retrieval embedding');
      }
      return { vectorLiteral: `[${values.join(',')}]`, modelUsed: model };
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Failed to generate retrieval embedding');
}

export async function runDailyBrief(options = {}) {
  const {
    supabaseUrl,
    serviceRole,
    geminiKey,
    model = process.env.AGENT_MODEL || 'gemini-2.0-flash',
    embeddingModel = process.env.AGENT_EMBEDDING_MODEL || 'gemini-embedding-001',
    ownerKey = process.env.AGENT_OWNER_KEY || 'default',
    runDate,
    dryRun = false,
    writeFile = true
  } = options;

  if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL');
  if (!serviceRole) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  if (!geminiKey) throw new Error('Missing GEMINI_API_KEY or VITE_GEMINI_API_KEY');

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const promptPath = path.join(process.cwd(), 'agents', 'prompt_v1.md');
  const promptContract = fs.readFileSync(promptPath, 'utf8');

  const runPayload = {
    run_type: 'DAILY_BRIEF',
    status: 'STARTED',
    prompt_version: 'prompt_v1',
    model,
    started_at: new Date().toISOString()
  };

  const { data: runRow, error: runStartErr } = await db
    .from('agent_runs')
    .insert(runPayload)
    .select('id')
    .single();
  if (runStartErr) throw new Error(`Failed to start agent run: ${runStartErr.message}`);
  const runId = runRow.id;

  try {
    const [profileRes, projectsRes, areasRes, tasksRes, resourcesRes, historyRes] = await Promise.all([
      db.from('user_profile').select('*').eq('owner_key', ownerKey).maybeSingle(),
      db.from('projects').select('*'),
      db.from('areas').select('*'),
      db.from('tasks').select('*'),
      db.from('resources').select('*'),
      db.from('history').select('*').order('timestamp', { ascending: false }).limit(40)
    ]);

    if (profileRes.error) throw new Error(profileRes.error.message);
    if (projectsRes.error) throw new Error(projectsRes.error.message);
    if (areasRes.error) throw new Error(areasRes.error.message);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (resourcesRes.error) throw new Error(resourcesRes.error.message);
    if (historyRes.error) throw new Error(historyRes.error.message);

    const profile = profileRes.data || {
      owner_key: ownerKey,
      display_name: 'User',
      timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok',
      goals: [],
      constraints: [],
      preferences: {}
    };
    const effectiveRunDate = runDate || dateInTimeZone(profile.timezone || process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok');

    const projects = projectsRes.data || [];
    const areas = areasRes.data || [];
    const tasks = tasksRes.data || [];
    const resources = resourcesRes.data || [];
    const recentLogs = historyRes.data || [];

    const nowIso = new Date().toISOString();
    const todayItems = tasks
      .filter((t) => !t.is_completed)
      .filter((t) => !t.due_date || t.due_date <= effectiveRunDate)
      .sort((a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31'))
      .slice(0, 12)
      .map(compactItem);

    const paraSnapshot = {
      projects: projects.map(compactItem).slice(0, 50),
      areas: areas.map(compactItem).slice(0, 50),
      tasks: tasks.map(compactItem).slice(0, 80),
      resources: resources.map(compactItem).slice(0, 50)
    };

    let memoryRetrieval = [];
    let ragWarning = null;
    let retrievalDiagnostics = null;
    try {
      const retrievalQuery = buildRetrievalQuery(todayItems, recentLogs, profile);
      const ragStart = Date.now();
      const embedStart = Date.now();
      const embedded = await embedQuery(ai, retrievalQuery, embeddingModel);
      const embedMs = Date.now() - embedStart;
      const queryEmbedding = embedded.vectorLiteral;
      const ragRes = await db.rpc('match_memory_chunks', {
        query_embedding: queryEmbedding,
        match_count: 8,
        source_tables: ['projects', 'tasks', 'resources', 'history', 'daily_summaries']
      });
      if (ragRes.error) throw new Error(ragRes.error.message);
      memoryRetrieval = ragRes.data || [];
      const ragMs = Date.now() - ragStart;
      const sourceMix = memoryRetrieval.reduce((acc, cur) => {
        const k = cur.source_table || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const sims = memoryRetrieval.map((m) => Number(m.similarity || 0)).filter((x) => !Number.isNaN(x));
      retrievalDiagnostics = {
        query_chars: retrievalQuery.length,
        requested_k: 8,
        returned_k: memoryRetrieval.length,
        embedding_model_used: embedded.modelUsed,
        embed_ms: embedMs,
        retrieval_ms: ragMs,
        source_mix: sourceMix,
        similarity: {
          avg: sims.length ? Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(6)) : null,
          min: sims.length ? Number(Math.min(...sims).toFixed(6)) : null,
          max: sims.length ? Number(Math.max(...sims).toFixed(6)) : null
        }
      };
    } catch (e) {
      ragWarning = e instanceof Error ? e.message : String(e);
      memoryRetrieval = [];
    }

    const inputBlocks = {
      profile: {
        owner_key: profile.owner_key,
        display_name: profile.display_name,
        timezone: profile.timezone,
        goals: getJson(profile.goals, []),
        constraints: getJson(profile.constraints, []),
        preferences: getJson(profile.preferences, {})
      },
      para_snapshot: paraSnapshot,
      today_items: todayItems,
      memory_retrieval: memoryRetrieval.map((m) => ({
        id: m.id,
        source_table: m.source_table,
        source_id: m.source_id,
        similarity: m.similarity,
        chunk_text: m.chunk_text,
        metadata: m.metadata
      })),
      recent_logs: recentLogs
    };

    const prompt = [
      promptContract,
      '',
      '---',
      'Context JSON:',
      JSON.stringify(inputBlocks, null, 2),
      '',
      `Date for output heading: ${effectiveRunDate}`,
      ragWarning ? `RAG warning: ${ragWarning}` : '',
      'Return markdown only.'
    ].join('\n');

    const llmStart = Date.now();
    const response = await runWithRetry(() => ai.models.generateContent({ model, contents: prompt }));
    const llmMs = Date.now() - llmStart;
    const rawMarkdown = (response.text || '').trim();
    const outputMarkdown = ensureHeadings(rawMarkdown, effectiveRunDate);

    let outputFile = '';
    if (writeFile) {
      const outputDir = path.join(process.cwd(), 'memory', 'daily');
      outputFile = path.join(outputDir, `${effectiveRunDate}.md`);
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputFile, outputMarkdown);
    }

    const metrics = {
      generated_at: nowIso,
      counts: {
        projects: projects.length,
        areas: areas.length,
        tasks: tasks.length,
        resources: resources.length,
        today_items: todayItems.length,
        recent_logs: recentLogs.length,
        memory_hits: memoryRetrieval.length
      },
      retrieval: retrievalDiagnostics || {
        query_chars: 0,
        requested_k: 8,
        returned_k: 0,
        embedding_model_used: null,
        embed_ms: null,
        retrieval_ms: null,
        source_mix: {},
        similarity: { avg: null, min: null, max: null }
      },
      generation: {
        model,
        output_chars: outputMarkdown.length,
        llm_ms: llmMs
      },
      warnings: ragWarning ? { rag: ragWarning } : {}
    };

    if (!dryRun) {
      const { error: summaryErr } = await db.from('memory_summaries').upsert({
        summary_type: 'DAILY',
        summary_date: effectiveRunDate,
        title: `Daily Brief - ${effectiveRunDate}`,
        content_md: outputMarkdown,
        input_refs: inputBlocks.memory_retrieval.map((m) => ({
          chunk_id: m.id,
          source_table: m.source_table,
          source_id: m.source_id,
          similarity: m.similarity
        })),
        created_by: 'agent'
      });
      if (summaryErr) throw new Error(`Write memory_summaries failed: ${summaryErr.message}`);
    }

    const { error: completeErr } = await db
      .from('agent_runs')
      .update({
        status: 'SUCCESS',
        output_file: outputFile || null,
        metrics,
        completed_at: new Date().toISOString()
      })
      .eq('id', runId);
    if (completeErr) throw new Error(`Failed to complete run: ${completeErr.message}`);

    return { runId, runDate: effectiveRunDate, outputFile, metrics };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('agent_runs')
      .update({
        status: 'FAILED',
        error_text: message,
        completed_at: new Date().toISOString()
      })
      .eq('id', runId);
    throw err;
  }
}
