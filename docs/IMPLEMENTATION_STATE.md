# PARA Brain Agent Implementation State

## Scope
- Work one phase at a time to control context size and risk.
- Keep prompt contracts versioned (`prompt_v1`, `prompt_v2`, ...).

## Phase Status
- Phase 1 (Foundation): `completed`
- Phase 2 (Ingestion + Embeddings): `completed`
- Phase 3 (Agent Orchestrator): `completed`
- Phase 4 (UI Integration): `completed`
- Phase 5 (Hardening + Product Prep): `completed`
- Phase C (Retrieval Quality / RAG v2): `completed`
- Phase D (Capture Flow Desktop + Mobile): `completed`
- Phase E (Automation + Heartbeat): `completed`
- Phase F (OpenClaw / External Agent Integration): `completed`
- Phase G (Personal Ops + Finance Autopilot): `completed`
- Tuning Sprint P0 (Bundle/Agent Query/Retry Policy): `completed`
- UX Mission Control Sprint V1: `completed`
- Telegram Integration Sprint: `in_progress`
- Thailand Pulse Sprint (Phase 1 -> 1.2): `completed`

## Phase 1 Deliverables
- [x] DB schema migration for profile/memory/run tracking
- [x] Prompt contract v1
- [x] Markdown templates (`daily`, `weekly`)
- [x] One mock command to generate daily brief

## How To Run Phase 1 Mock
1. `npm run agent:mock-daily`
2. Output file: `memory/daily/mock-YYYY-MM-DD.md`

## Phase 2 Deliverables
- [x] SQL migration for vector retrieval (`match_memory_chunks`) + ivfflat index
- [x] Ingestion script to chunk source data into `memory_chunks`
- [x] Embedding pipeline (`text-embedding-004`, 1536-dim) with `--no-embed` fallback
- [x] NPM commands for ingestion

## How To Run Phase 2 Ingestion
1. Run migration: `supabase/migrations/20260212_phase2_ingestion_embeddings.sql`
2. Set envs: `VITE_SUPABASE_URL`, (`SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_ANON_KEY`), and (`GEMINI_API_KEY` or `VITE_GEMINI_API_KEY`)
3. Full ingest with embeddings: `npm run agent:ingest`
4. Ingest chunks without embeddings: `npm run agent:ingest:no-embed`

## Phase 3 Deliverables
- [x] Orchestrator command for daily brief run (`agent_runs` STARTED/SUCCESS/FAILED)
- [x] Context assembly (`profile`, PARA snapshot, today items, recent logs)
- [x] RAG retrieval via `match_memory_chunks` with query embedding
- [x] Prompt execution with prompt contract v1 + markdown output write
- [x] Persist daily summary to `memory_summaries`

## How To Run Phase 3 Orchestrator
1. Ensure Phase 1 and 2 migrations are applied
2. Set envs: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and (`GEMINI_API_KEY` or `VITE_GEMINI_API_KEY`)
   - Optional: `AGENT_EMBEDDING_MODEL` (default: `gemini-embedding-001`)
3. Run: `npm run agent:daily`
4. Output markdown: `memory/daily/YYYY-MM-DD.md`

## Phase 4 Deliverables
- [x] Agent board integrated into app navigation (`Agent` tab)
- [x] UI for latest daily summary + recent run history (`memory_summaries`, `agent_runs`)
- [x] Manual refresh + API-triggered run action from UI

## Phase 5 Deliverables
- [x] Secure API trigger endpoint (`POST /api/agent-daily`)
- [x] Cooldown rate guard (5 min) + idempotency guard by date
- [x] Shared orchestrator core for CLI/API consistency
- [x] Script wrapper supports `--dry-run` and date override
- [x] Reliability updates: timezone-aware daily date, RAG fail-safe, UI force retry path

## Phase C Deliverables
- [x] HNSW index migration option for memory embeddings
- [x] Benchmark script for IVFFlat vs HNSW latency (`agent:benchmark:indexes`)
- [x] Retrieval diagnostics in `agent_runs.metrics` (latency, source mix, similarity stats, embedding model used)

## How To Run Phase C Benchmark
1. Ensure `DATABASE_URL` is set
2. Run HNSW migration (optional but recommended): `supabase/migrations/20260212_phase3_hnsw_index.sql`
3. Benchmark: `npm run agent:benchmark:indexes`
4. Result file: `docs/benchmarks/latest_vector_benchmark.json`

## Phase D Deliverables
- [x] Quick Capture input flow on desktop and mobile
- [x] AI classify capture to PARA type/category with confidence
- [x] Auto-save high-confidence captures
- [x] Triage queue for low-confidence captures (`triage-pending`)
- [x] Resolve actions in Agent tab (approve task / convert project / open detail)

## Phase E Deliverables
- [x] Heartbeat contract doc (`docs/HEARTBEAT.md`)
- [x] Heartbeat runtime script (`npm run agent:heartbeat`)
- [x] Cron endpoints for daily run and heartbeat checks
- [x] Approval gate support for risky automation operations

## How To Run Phase E Automation
1. Set `CRON_SECRET`
2. Run heartbeat local: `npm run agent:heartbeat`
3. Trigger cron daily run: `POST /api/cron-agent-daily` with `x-cron-key`
4. Trigger cron heartbeat: `POST /api/cron-heartbeat` with `x-cron-key`
5. Optional safety:
   - `ENABLE_APPROVAL_GATES=true` to block risky messaging actions pending approval
   - `APPROVAL_SECRET` to require `x-approval-key` for force runs

## Phase F Deliverables
- [x] External agent queue schema (`external_agent_jobs`)
- [x] External agent audit trail (`external_agent_actions`)
- [x] Atomic RPC flow: approve, claim, finish
- [x] API contract for external agents (create/list/approve/claim/finish)

## How To Run Phase F Integration
1. Run migration: `supabase/migrations/20260212_phaseF_external_agent_jobs.sql`
2. Set `AGENT_JOB_SECRET` (or use `CRON_SECRET` fallback)
3. Create job: `POST /api/agent-jobs`
4. Approve: `POST /api/agent-jobs-approve`
5. Claim from agent: `POST /api/agent-jobs-claim`
6. Finish with result/error: `POST /api/agent-jobs-finish`

## Phase G Deliverables
- [x] Weekly personal ops review generator (`npm run agent:weekly-review`)
- [x] Weekly summary persisted to `memory_summaries` (`WEEKLY`)
- [x] Cron endpoint for weekly review (`POST /api/cron-weekly-review`)
- [x] Agent KPI cards in UI (overdue, triage backlog, net 30d, automation success 7d)

## Tuning Sprint P0 Deliverables
- [x] Frontend lazy split for `AgentBoard`, `ReviewBoard`, `FinanceBoard`, `ChatPanel`
- [x] Vendor manual chunks in Vite build for `react`, `@google/genai`, `@supabase/supabase-js`
- [x] Agent query slimming in `hooks/useAgentData.ts` (explicit select fields + tighter limits)
- [x] Shared timeout/retry policy for external API calls (messaging + Gemini) in server endpoint paths

## How To Verify Tuning Sprint P0
1. Build: `npm run build` and review chunk output for split vendor/main improvements
2. Smoke: `npm run agent:daily:dry`
3. Manual smoke: open Agent tab and confirm refresh/run flow + chat/finance/review tabs lazy-load correctly

## UX Mission Control Sprint V1 Deliverables
- [x] App shell converted to mission-control look and feel (dark command-center tone across sidebar/header/content)
- [x] Unified focus queue added as a shared strip for non-Agent tabs (`components/FocusDock.tsx`)
- [x] Dashboard replaced with mission control board (`components/MissionControlBoard.tsx`)
- [x] Mission board includes KPI visualizations (SVG bar/line/donut + completion progress)
- [x] Agent tab redesigned to mission-control 3-pane layout with mobile/tablet responsive behavior
- [x] Right-side chat column replaced by floating chat widget overlay (open/close from FAB)
- [x] External skills installed and used for dashboard/visualization guidance:
  - `dashboard-creator-ext`
  - `d3-viz-ext`

## How To Verify UX Mission Control Sprint V1
1. Run build: `npm run build`
2. Open app and verify:
   - `Mission` menu shows mission dashboard instead of old Life Dashboard
   - Focus queue appears above each non-Agent board
   - Chat opens as floating overlay widget (does not consume fixed right column)
3. Responsive checks:
   - Desktop: mission board + floating chat at bottom-right
   - Tablet: mission board cards remain readable and chat overlay stays usable
   - Mobile: chat opens as full-height floating overlay and closes cleanly

## Telegram Integration Sprint (Current)
- [x] LINE integration removed and replaced with Telegram endpoints/services/env wiring
- [x] Telegram push path supports `TELEGRAM_CHAT_ID` with `TELEGRAM_USER_ID` fallback
- [x] Telegram log rows (`system_logs.event_source=TELEGRAM`) are loaded and streamed into web ChatPanel
- [x] Telegram sender labeling rendered in chat timeline
- [ ] Special cards from Telegram logs (created PARA item / transaction / module card) are not generated yet

## Thailand Pulse Sprint (Phase 1 -> 1.2)
- [x] New left menu + one-page `Thailand Pulse` board with category cards, trend radar, source coverage, and save-to-resource flow
- [x] Feed API (`/api/thailand-pulse`) with provider layer:
  - RSS fallback
  - Exa discovery when `EXA_API_KEY` exists
  - Firecrawl citation enrichment when `FIRECRAWL_API_KEY` exists
- [x] Citation contract rendered in UI (per-story sources/evidence)
- [x] Supabase snapshot persistence (`pulse_snapshots`) for cross-device history
- [x] History API (`GET /api/thailand-pulse?mode=history&days=7`)
- [x] Cron ingestion endpoint (`/api/cron-thailand-pulse`)
- [x] Vercel 12h schedule (`vercel.json`)
- [x] DB migration applied on production-like DB:
  - `supabase/migrations/20260213_phaseH_thailand_pulse_snapshots.sql`
  - Verified table/indexes exist via `\d+ pulse_snapshots`

## How To Run Thailand Pulse (Phase 1.2)
1. Ensure env values exist:
   - Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Optional intelligence layer: `EXA_API_KEY`, `FIRECRAWL_API_KEY`
2. Apply migration:
   - `supabase/migrations/20260213_phaseH_thailand_pulse_snapshots.sql`
3. Pull latest snapshot:
   - `GET /api/thailand-pulse?interests=Technology,AI,Economic,Political,Business`
4. Read history:
   - `GET /api/thailand-pulse?mode=history&days=7`
5. Trigger scheduled ingest manually (or via cron):
   - `POST /api/cron-thailand-pulse` with `x-cron-key: <CRON_SECRET>`

## Next Session (Recommended)
1. Build Telegram log -> structured operation mapping so chat can render created-item cards directly from inbound Telegram events
2. Persist operation metadata per Telegram interaction (operation, type, payload reference) to avoid brittle text parsing
3. Add guardrails for duplicate replay (same Telegram update id should not create duplicate cards/items)
4. Continue queued backend tuning P1 (retrieval benchmark expansion, hot-query DB index review, observability baseline)

## Notes
- Keep DB as source-of-truth.
- RAG retrieval uses `memory_chunks` + `match_memory_chunks(...)`.
