# Thailand Pulse: Web MCP Phase 1.1

Last updated: 2026-02-13

## Goal
- Improve freshness and trust of daily updates by layering `EXA` discovery + `Firecrawl` extraction on top of RSS fallback.
- Keep one-page UI simple while exposing citations and evidence for fast verification.

## Phase Status
- Phase 1: completed
- Phase 1.1: completed
- Phase 1.2: completed
  - Snapshot history is persisted in Supabase table `pulse_snapshots`.
  - API route `GET /api/thailand-pulse?mode=history&days=7` serves cross-device history.
  - Cron route `/api/cron-thailand-pulse` is available and scheduled every 12 hours via `vercel.json`.

## Runtime Provider Strategy
1. `EXA_API_KEY` available:
   - Use Exa Search as primary discovery (`api.exa.ai/search`) for fresh links.
   - If result count is low, blend with RSS.
2. `FIRECRAWL_API_KEY` available:
   - Enrich top stories per category with page extraction (`api.firecrawl.dev/v1/scrape`).
   - Attach evidence snippets and citation metadata.
3. No keys:
   - Fallback to RSS-only mode.

## Trust Model (Current)
- Tier A: Reuters, AP, BBC, FT, Bloomberg, Nikkei, Economist
- Tier B: Thai PBS, Bangkok Post, The Nation Thailand, Prachatai, Thai Rath, Matichon, The Standard
- Tier C: blog/forum/opinion style sources

## Citation Contract
Each article should include:
- `label`
- `url`
- `publisher` (if available)
- `publishedAt` (if available)
- `retrievedAt`
- `provider`
- optional `evidence` text snippet

UI shows up to 3 citations per story.

## Recommended Next Steps
1. Add source allow/deny list UI for user-controlled trust policy.
2. Add per-topic confidence scoring with transparent formula (source tier + corroboration + freshness).
3. Add user feedback loop (`relevant`/`not relevant`) to improve ranking over time.

## Reference URLs
- MCP specification: https://modelcontextprotocol.io/specification/2025-06-18
- Exa MCP docs: https://docs.exa.ai/reference/mcp-server
- Firecrawl MCP docs: https://docs.firecrawl.dev/mcp-server/overview
- Firecrawl API docs: https://docs.firecrawl.dev/api-reference/endpoint/scrape
- Google Trends API docs: https://developers.google.com/search/apis/trends
- Google Trends API announcement: https://developers.google.com/search/blog/2025/08/trends-api
- Reuters trust principles: https://www.reuters.com/principles-trust/
- AP values: https://www.ap.org/our-company/our-values/
