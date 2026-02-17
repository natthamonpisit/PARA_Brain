-- Phase 2: ingestion + embeddings retrieval helpers

create index if not exists idx_memory_chunks_embedding_ivfflat
on memory_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create or replace function match_memory_chunks (
  query_embedding vector(1536),
  match_count int default 8,
  source_tables text[] default null
)
returns table (
  id uuid,
  source_table text,
  source_id text,
  chunk_text text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    mc.id,
    mc.source_table,
    mc.source_id,
    mc.chunk_text,
    mc.metadata,
    1 - (mc.embedding <=> query_embedding) as similarity
  from memory_chunks mc
  where mc.embedding is not null
    and (
      source_tables is null
      or array_length(source_tables, 1) is null
      or mc.source_table = any(source_tables)
    )
  order by mc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
