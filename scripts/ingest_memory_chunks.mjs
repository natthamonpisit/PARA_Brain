import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const MAX_CHARS = 900;
const OVERLAP_CHARS = 150;
const INSERT_BATCH_SIZE = 200;
const EMBED_BATCH_SIZE = 20;

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

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function chunkText(text, maxChars = MAX_CHARS, overlapChars = OVERLAP_CHARS) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks.filter(Boolean);
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function vectorToPgString(vector) {
  return `[${vector.join(',')}]`;
}

async function fetchAllRows(client, table, selectClause = '*') {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from(table)
      .select(selectClause)
      .range(from, to);

    if (error) {
      throw new Error(`[${table}] fetch failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

const TABLE_BUILDERS = [
  {
    table: 'projects',
    select: 'id,title,content,category,status,deadline,tags,updated_at,created_at',
    build: (row) => ({
      sourceId: row.id,
      sourceUpdatedAt: row.updated_at || row.created_at,
      metadata: { title: row.title, category: row.category, status: row.status, type: 'PROJECT' },
      text: [
        `Project: ${row.title || ''}`,
        `Category: ${row.category || ''}`,
        `Status: ${row.status || ''}`,
        `Deadline: ${row.deadline || ''}`,
        `Tags: ${(row.tags || []).join(', ')}`,
        `Content: ${row.content || ''}`
      ].join('\n')
    })
  },
  {
    table: 'areas',
    select: 'id,title,name,content,category,emoji,tags,updated_at,created_at',
    build: (row) => ({
      sourceId: row.id,
      sourceUpdatedAt: row.updated_at || row.created_at,
      metadata: { title: row.title || row.name, category: row.category, type: 'AREA' },
      text: [
        `Area: ${row.title || row.name || ''}`,
        `Category: ${row.category || ''}`,
        `Emoji: ${row.emoji || ''}`,
        `Tags: ${(row.tags || []).join(', ')}`,
        `Content: ${row.content || ''}`
      ].join('\n')
    })
  },
  {
    table: 'tasks',
    select: 'id,title,content,category,due_date,energy_level,is_completed,tags,updated_at,created_at',
    build: (row) => ({
      sourceId: row.id,
      sourceUpdatedAt: row.updated_at || row.created_at,
      metadata: {
        title: row.title,
        category: row.category,
        due_date: row.due_date,
        energy_level: row.energy_level,
        is_completed: row.is_completed,
        type: 'TASK'
      },
      text: [
        `Task: ${row.title || ''}`,
        `Category: ${row.category || ''}`,
        `Due Date: ${row.due_date || ''}`,
        `Energy: ${row.energy_level || ''}`,
        `Completed: ${row.is_completed ? 'yes' : 'no'}`,
        `Tags: ${(row.tags || []).join(', ')}`,
        `Content: ${row.content || ''}`
      ].join('\n')
    })
  },
  {
    table: 'resources',
    select: 'id,title,content,category,tags,updated_at,created_at',
    build: (row) => ({
      sourceId: row.id,
      sourceUpdatedAt: row.updated_at || row.created_at,
      metadata: { title: row.title, category: row.category, type: 'RESOURCE' },
      text: [
        `Resource: ${row.title || ''}`,
        `Category: ${row.category || ''}`,
        `Tags: ${(row.tags || []).join(', ')}`,
        `Content: ${row.content || ''}`
      ].join('\n')
    })
  },
  {
    table: 'archives',
    select: 'id,title,content,category,tags,updated_at,created_at',
    build: (row) => ({
      sourceId: row.id,
      sourceUpdatedAt: row.updated_at || row.created_at,
      metadata: { title: row.title, category: row.category, type: 'ARCHIVE' },
      text: [
        `Archive: ${row.title || ''}`,
        `Category: ${row.category || ''}`,
        `Tags: ${(row.tags || []).join(', ')}`,
        `Content: ${row.content || ''}`
      ].join('\n')
    })
  },
  {
    table: 'history',
    select: 'id,action,item_title,item_type,timestamp',
    build: (row) => ({
      sourceId: row.id,
      sourceUpdatedAt: row.timestamp,
      metadata: { action: row.action, item_type: row.item_type, title: row.item_title, type: 'HISTORY' },
      text: [
        `History Action: ${row.action || ''}`,
        `Item Type: ${row.item_type || ''}`,
        `Item Title: ${row.item_title || ''}`,
        `Timestamp: ${row.timestamp || ''}`
      ].join('\n')
    })
  },
  {
    table: 'daily_summaries',
    select: 'id,date,summary,created_at',
    build: (row) => ({
      sourceId: row.id,
      sourceUpdatedAt: row.created_at,
      metadata: { date: row.date, type: 'DAILY_SUMMARY' },
      text: [`Summary Date: ${row.date || ''}`, `Summary: ${row.summary || ''}`].join('\n')
    })
  }
];

async function embedBatch(texts, ai, preferredModel) {
  const candidates = [preferredModel, 'gemini-embedding-001', 'text-embedding-004'].filter(Boolean);
  let lastError = null;

  for (const model of [...new Set(candidates)]) {
    try {
      const response = await ai.models.embedContent({
        model,
        contents: texts,
        config: {
          outputDimensionality: 1536
        }
      });

      const embeddings = response.embeddings || [];
      if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
        throw new Error('Gemini embedding response size mismatch');
      }

      return embeddings.map((item) => {
        const vec = item?.values || item?.embedding?.values || [];
        if (!Array.isArray(vec) || vec.length !== 1536) {
          throw new Error('Embedding size mismatch: expected 1536');
        }
        return vec;
      });
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Failed to generate embeddings');
}

async function deleteExistingForSource(client, sourceTable, sourceId) {
  const { error } = await client
    .from('memory_chunks')
    .delete()
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId);
  if (error) throw new Error(`Delete existing chunks failed: ${error.message}`);
}

async function insertChunks(client, chunks) {
  for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await client.from('memory_chunks').insert(batch);
    if (error) {
      throw new Error(`Insert chunks failed: ${error.message}`);
    }
  }
}

async function main() {
  loadLocalEnv();
  const args = new Set(process.argv.slice(2));
  const noEmbed = args.has('--no-embed');

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const embeddingModel = process.env.AGENT_EMBEDDING_MODEL || 'gemini-embedding-001';

  if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL');
  if (!serviceRole) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY');
  if (!noEmbed && !geminiKey) {
    throw new Error('Missing GEMINI_API_KEY or VITE_GEMINI_API_KEY (or run with --no-embed)');
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const gemini = !noEmbed ? new GoogleGenAI({ apiKey: geminiKey }) : null;

  let totalRows = 0;
  let totalChunks = 0;

  for (const def of TABLE_BUILDERS) {
    const rows = await fetchAllRows(admin, def.table, def.select);
    totalRows += rows.length;
    console.log(`[ingest] ${def.table}: ${rows.length} rows`);

    for (const row of rows) {
      const built = def.build(row);
      const sourceId = String(built.sourceId || '');
      if (!sourceId) continue;

      const textChunks = chunkText(built.text);
      if (textChunks.length === 0) continue;
      totalChunks += textChunks.length;

      let embeddings = new Array(textChunks.length).fill(null);
      if (!noEmbed) {
        embeddings = [];
        for (let i = 0; i < textChunks.length; i += EMBED_BATCH_SIZE) {
          const batchTexts = textChunks.slice(i, i + EMBED_BATCH_SIZE);
          const batchEmbeddings = await embedBatch(batchTexts, gemini, embeddingModel);
          embeddings.push(...batchEmbeddings);
        }
      }

      const chunkRows = textChunks.map((chunk, idx) => ({
        source_table: def.table,
        source_id: sourceId,
        source_updated_at: built.sourceUpdatedAt || null,
        chunk_text: chunk,
        chunk_tokens: estimateTokens(chunk),
        metadata: {
          ...built.metadata,
          chunk_index: idx,
          chunk_count: textChunks.length
        },
        embedding: embeddings[idx] ? vectorToPgString(embeddings[idx]) : null
      }));

      await deleteExistingForSource(admin, def.table, sourceId);
      await insertChunks(admin, chunkRows);
    }
  }

  console.log(`[ingest] done. source_rows=${totalRows} chunks=${totalChunks} embed=${!noEmbed}`);
}

main().catch((err) => {
  console.error(`[ingest] failed: ${err.message}`);
  process.exit(1);
});
