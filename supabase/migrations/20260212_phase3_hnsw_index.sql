-- Phase 3: retrieval quality index option (HNSW)
-- Keep ivfflat for compatibility during benchmark/migration window.

create index if not exists idx_memory_chunks_embedding_hnsw
on memory_chunks
using hnsw (embedding vector_cosine_ops);
