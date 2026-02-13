<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1vRVh2cBTUcaOIZ9-0HlasbLn7RJFwr09

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example` and fill required values.
3. For local AI chat in the browser, set `VITE_GEMINI_API_KEY`.
4. For serverless APIs (`/api/*`), set secrets in Vercel env:
   - `GEMINI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_USER_ID` (optional but recommended)
   - `TELEGRAM_WEBHOOK_SECRET` (optional but recommended)
   - `CRON_SECRET`
5. Run the app:
   `npm run dev`

## Agent Foundation (Phase 1)

- Prompt contract: `agents/prompt_v1.md`
- Templates: `memory/templates/daily.md`, `memory/templates/weekly.md`
- Migration: `supabase/migrations/20260212_phase1_agent_memory.sql`
- State tracker: `docs/IMPLEMENTATION_STATE.md`

Generate a mock daily brief:
`npm run agent:mock-daily`

## Agent Pipeline (Phases 2-5)

- Ingest memory chunks: `npm run agent:ingest`
- Run orchestrator (CLI): `npm run agent:daily`
- Run orchestrator dry-run: `npm run agent:daily -- --dry-run`
- Benchmark vector index latency: `npm run agent:benchmark:indexes`
- Run heartbeat check: `npm run agent:heartbeat`
- Run weekly ops review: `npm run agent:weekly-review`
- API trigger: `POST /api/agent-daily`
  - If `CRON_SECRET` is set, provide `x-cron-key: <CRON_SECRET>`
  - If `force=true` and `APPROVAL_SECRET` is set, provide `x-approval-key: <APPROVAL_SECRET>`
- Cron endpoints:
  - `POST /api/cron-agent-daily` (requires `x-cron-key`)
  - `POST /api/cron-heartbeat` (requires `x-cron-key`)
  - `POST /api/cron-weekly-review` (requires `x-cron-key`)
- Telegram endpoints:
  - `POST /api/telegram-webhook` (set as bot webhook URL)
  - `POST /api/telegram-push` (manual push helper)
- External agent queue APIs (OpenClaw integration):
  - `POST /api/agent-jobs` create job (`requestText`, optional `payload`, `priority`, `dedupeKey`)
  - `GET /api/agent-jobs?status=REQUESTED|APPROVED|RUNNING|DONE|FAILED|CANCELLED`
  - `POST /api/agent-jobs-approve` (`jobId`, `approve`, `note`)
  - `POST /api/agent-jobs-claim` (`agentName`)
  - `POST /api/agent-jobs-finish` (`jobId`, `agentName`, `success`, `result`, `errorText`)
  - Auth: `x-agent-key` (uses `AGENT_JOB_SECRET`, fallback `CRON_SECRET`)
