# PARA Brain User Journey UAT Test Scripts

Last updated: 2026-02-13
Owner: Mission Control QA backlog
Scope: End-to-end manual + API smoke scripts from first-time onboarding to daily operation.

## 1. Current Real Test Status
The following were executed in this session:
- `npm run build` passed.
- `npx tsc --noEmit` passed.
- `npm run agent:daily:dry` passed with run id `bdd84907-3dc3-4341-90c0-e4e3dc8601ed`.
- Thailand Pulse generation smoke passed via pipeline call (`provider=RSS`, all 5 categories returned 8 articles each).
- DB migrations applied successfully:
  - `supabase/migrations/20260213_phaseI_tuning_p1_indexes_observability.sql`
  - `supabase/migrations/20260213_phaseI_thailand_pulse_quality.sql`
- Retrieval benchmark matrix executed:
  - samples=50 winner `hnsw`
  - samples=100 winner `hnsw`

Not yet executed as full manual E2E in this session:
- Full click-through UAT across desktop/tablet/mobile for all scripts below.
- Live Telegram roundtrip with real bot/user in this exact session window.
- Cron-triggered 12h/heartbeat behavior in production scheduler window.

## 2. Test Environment Matrix
Run all scripts on:
- Desktop: macOS + Chrome latest.
- Desktop: Windows + Chrome latest.
- Mobile: iOS Safari and Android Chrome.

Environment prerequisites:
- `.env` includes Supabase + Gemini + Telegram bot keys.
- DB migrations up to Phase I applied.
- Optional for richer Pulse provider checks: `EXA_API_KEY`, `FIRECRAWL_API_KEY`.

## 3. Data Reset / Setup Scripts
Use before full regression cycle.

### SETUP-001 Baseline backup
Command:
```bash
pg_dump "$DATABASE_URL" > backup-before-uat.sql
```
Expected:
- Backup file exists and is non-empty.

### SETUP-002 Optional cleanup for deterministic UAT
Command:
```sql
delete from system_logs where event_source in ('WEB','TELEGRAM');
delete from pulse_feedback where owner_key='default';
delete from pulse_source_preferences where owner_key='default';
update tasks set is_notified=false where is_notified=true;
```
Expected:
- Clean baseline for repeatable flow.

## 4. Journey Scripts (Detailed)

## Phase A: First-time User Onboarding

### ONB-001 First launch and shell rendering
Preconditions:
- Fresh browser profile.
Steps:
1. Open app.
2. Wait for initial data load.
Expected:
- Sidebar renders all main menus.
- No crash/blank state.
- Mission board is visible.
Evidence:
- Screenshot of initial load.

### ONB-002 Default nav and counts
Steps:
1. Click each left menu item once.
2. Return to Mission.
Expected:
- Navigation works without full-page reload.
- Badges/counts render and are readable.

### ONB-003 Create first item via `+ New Item`
Steps:
1. Create one `Area`, one `Project`, one `Task`.
2. Save each item.
Expected:
- Item appears in corresponding board.
- History log records create action.

### ONB-004 Edit from detail modal
Steps:
1. Open task detail.
2. Change title/content/tags/due date.
3. Save.
Expected:
- Board reflects updated values.
- `updatedAt` changes.

### ONB-005 Quick capture basic
Steps:
1. Type free-text idea in command capture input.
2. Submit capture.
Expected:
- New item is created or triaged.
- Notification confirms action.

### ONB-006 Search and filter
Steps:
1. Search by task keyword.
2. Search by tag.
3. Clear search.
Expected:
- Filter result matches query.
- Clear restores full list.

### ONB-007 Complete and undo task
Steps:
1. Mark active task done.
2. Click undo in toast.
Expected:
- Done state toggles correctly.
- Undo reopens task.

### ONB-008 Archive flow
Steps:
1. Complete task again.
2. Archive from action flow.
Expected:
- Item leaves active board.
- Item is visible under Archives.

### ONB-009 Persistence after reload
Steps:
1. Reload browser.
2. Return to same board.
Expected:
- Previously created/edited items remain.

### ONB-010 Mobile first-time layout
Steps:
1. Open on mobile width (<768px).
2. Navigate and open chat.
Expected:
- No clipped controls.
- Chat overlay usable and closable.

## Phase B: Web Chat Capture Intelligence

### CHAT-001 Chitchat should not create items
Input:
- `hello, how are you today?`
Steps:
1. Send message in chat widget.
Expected:
- Assistant replies conversationally.
- No created item card.
- No new PARA row from this message.

### CHAT-002 Actionable task capture
Input:
- `Tomorrow 9am prepare vendor shortlist for ATS project`
Expected:
- Task created with card shown in chat.
- Task linked to related project when detected.

### CHAT-003 Resource capture with URL
Input:
- `Read this later: https://github.com/koala73/worldmonitor`
Expected:
- Resource item created.
- URL retained in content.

### CHAT-004 Duplicate URL dedup behavior
Steps:
1. Send same URL capture again.
Expected:
- System replies duplicate-skip.
- No extra duplicate row created.

### CHAT-005 Low confidence confirmation gate
Input:
- Ambiguous instruction likely low confidence.
Expected:
- Status `PENDING` and confirmation guidance appears.

### CHAT-006 Confirmation command execution
Input:
- `ยืนยัน: <title from pending response>`
Expected:
- Pending item is actually created.

### CHAT-007 Complete task via chat
Input:
- `complete task prepare vendor shortlist`
Expected:
- Task is marked done.
- Chat shows completion result.

### CHAT-008 Batch create
Input:
- `Create project "Website refresh" and tasks design wireframe, write copy, QA`
Expected:
- Multiple created item cards appear.
- Parent/child relation preserved.

### CHAT-009 Transaction capture
Input:
- `Spent 450 THB coffee with client from cash account`
Expected:
- Transaction created and appears in Finance board.

### CHAT-010 Module item capture
Preconditions:
- At least one custom module exists.
Input:
- `Add lead: Company ABC, score 85, follow up next week`
Expected:
- Module item created and rendered in module board.

## Phase C: Telegram Bi-directional and Parity

### TG-001 Connect Telegram modal instructions
Steps:
1. Open `Connect Telegram` from sidebar.
Expected:
- Clear setup instructions for bot token/user id.

### TG-002 Telegram `id` command
Steps:
1. Send `id` to bot.
Expected:
- Bot returns `user_id` and `chat_id`.

### TG-003 Telegram message appears in web chat
Steps:
1. Send normal text from Telegram.
2. Open web chat timeline.
Expected:
- Message appears with source label `Telegram`.

### TG-004 Telegram actionable create shows special card
Input from Telegram:
- `Create task: research GLM-5 model updates`
Expected:
- Assistant response appears in timeline.
- Created item card appears (not text-only fallback).

### TG-005 Idempotency same update id
Method:
- Replay same webhook payload (same `update_id`).
Expected:
- API returns duplicate ignored.
- No duplicate item/card.

### TG-006 Unauthorized user guard
Preconditions:
- `TELEGRAM_USER_ID` set.
Steps:
1. Send from different user id.
Expected:
- Request ignored.
- No log/item created.

### TG-007 Unauthorized chat guard
Preconditions:
- `TELEGRAM_CHAT_ID` set.
Expected:
- Message from other chat ignored.

### TG-008 Invalid webhook secret
Preconditions:
- `TELEGRAM_WEBHOOK_SECRET` set.
Steps:
1. Call webhook with wrong header token.
Expected:
- HTTP 401.

### TG-009 Outbound push smoke
Steps:
1. Trigger `/api/telegram-push` with message.
Expected:
- Message delivered to configured chat id.

### TG-010 Telegram complete command
Input:
- `complete task research GLM-5 model updates`
Expected:
- Task completion reflected in web board.

### TG-011 Telegram error fallback visibility
Steps:
1. Temporarily break Gemini key.
2. Send Telegram message.
Expected:
- API returns error gracefully.
- No half-written corrupted rows.

### TG-012 Observability event log for webhook
SQL check:
```sql
select endpoint,status_code,ok,latency_ms
from api_observability_events
where endpoint='/api/telegram-webhook'
order by created_at desc
limit 5;
```
Expected:
- Events logged with status and latency.

## Phase D: Morning Mission Workflow

### MOR-001 Morning open flow
Steps:
1. Open app in morning.
2. Review Mission KPIs and priority strip.
Expected:
- KPI cards load quickly.
- Priority items visible without extra clicks.

### MOR-002 Life Overview dominant area default
Steps:
1. Open `Life Overview`.
Expected:
- Area with highest project+task load is expanded by default.

### MOR-003 Switch focus area
Steps:
1. Click a smaller area card.
Expected:
- Clicked area becomes primary card.
- Child project/progress info updates.

### MOR-004 Task status from dashboard card
Steps:
1. Mark task done directly from dashboard/list card.
Expected:
- State updates in both dashboard and detail modal.

### MOR-005 Review board readability and help tips
Steps:
1. Open Review board.
2. Hover help icons.
Expected:
- Bilingual tooltip appears.
- Layout remains readable.

### MOR-006 Agent board readability and timeline section
Steps:
1. Open Agent board.
2. Scroll command center, summary, timeline.
Expected:
- Cards are legible with consistent spacing.

### MOR-007 ESC closes chat widget
Steps:
1. Open chat widget.
2. Press `Esc`.
Expected:
- Chat closes immediately.

### MOR-008 Compact mode persistence
Steps:
1. Enable compact mode on desktop.
2. Reload app.
Expected:
- Compact preference persists.
- Mobile still forces non-compact behavior.

## Phase E: Thailand Pulse Quality

### TP-001 Latest snapshot load
Steps:
1. Open Thailand Pulse.
Expected:
- Latest snapshot renders with timestamp/provider.

### TP-002 7-day history selection
Steps:
1. Click previous day from history chips.
Expected:
- Historical snapshot loads correctly.

### TP-003 Add interest
Steps:
1. Add `Cybersecurity Thailand`.
2. Refresh.
Expected:
- New category appears and persists.

### TP-004 Remove interest fallback
Steps:
1. Remove all interests.
Expected:
- Defaults restored (`Technology`, `AI`, `Economic`, `Political`, `Business`).

### TP-005 Allowlist policy
Steps:
1. Add allow domain `reuters.com`.
2. Refresh Pulse.
Expected:
- Only allowlisted domains (and subdomains) appear.

### TP-006 Denylist policy
Steps:
1. Add deny domain `example-news.com`.
2. Refresh Pulse.
Expected:
- Denied domain articles excluded.

### TP-007 Confidence badges visible
Steps:
1. Inspect article chips.
Expected:
- `HIGH/MEDIUM/LOW` + numeric score visible.
- Reason text visible under article.

### TP-008 Relevant feedback capture
Steps:
1. Click `Relevant` on an article.
Expected:
- Button state persists locally.
- Feedback row upserted in `pulse_feedback`.

### TP-009 Not Relevant feedback capture
Steps:
1. Click `Not Relevant` on another article.
Expected:
- Negative feedback row saved.

### TP-010 Feedback affects ranking
Steps:
1. Repeatedly mark same domain/category relevant.
2. Refresh snapshot.
Expected:
- Similar stories rank higher by confidence score.

### TP-011 Save to resources
Steps:
1. Click `Save to Resources` for an article.
Expected:
- Resource item created with source/citation context.

### TP-012 Cron endpoint auth
Steps:
1. Call `/api/cron-thailand-pulse` without key.
2. Call with valid key.
Expected:
- Unauthorized then success.

### TP-013 Provider fallback behavior
Steps:
1. Run without EXA/FIRECRAWL keys.
Expected:
- `provider=RSS` or fallback note shown.

### TP-014 DB policy and feedback integrity
SQL checks:
```sql
select * from pulse_source_preferences where owner_key='default';
select owner_key,article_id,relevant,domain,category,updated_at
from pulse_feedback
where owner_key='default'
order by updated_at desc
limit 20;
```
Expected:
- Policy row exists.
- Feedback rows update on repeat clicks (upsert by owner+article).

## Phase F: Agent Automation and Observability

### AG-001 Daily dry-run
Command:
```bash
npm run agent:daily:dry
```
Expected:
- Success run with `dry_run=true`.

### AG-002 Daily trigger cooldown guard
Steps:
1. Trigger `/api/agent-daily` twice within 5 minutes.
Expected:
- Second call returns 429 unless force is used.

### AG-003 Force run approval guard
Preconditions:
- `APPROVAL_SECRET` set.
Steps:
1. Force without approval key.
2. Force with valid key.
Expected:
- 403 then success.

### AG-004 Cron daily auth
Steps:
1. Call `/api/cron-agent-daily` with/without valid key.
Expected:
- Unauthorized then success.

### AG-005 Heartbeat report
Command:
```bash
npm run agent:heartbeat
```
Expected:
- Heartbeat markdown generated with checks summary.

### AG-006 API observability table writes
SQL check:
```sql
select endpoint,status_code,ok,latency_ms,created_at
from api_observability_events
order by created_at desc
limit 30;
```
Expected:
- Entries exist for instrumented endpoints.

### AG-007 system_logs idempotency index behavior
SQL check:
```sql
select event_source,event_id,count(*)
from system_logs
where event_id is not null
group by 1,2
having count(*) > 1;
```
Expected:
- No rows.

### AG-008 Retrieval benchmark matrix
Command:
```bash
npm run agent:benchmark:indexes:p1
```
Expected:
- Matrix output file generated.
- Compare winners and keep policy recommendation.

## Phase G: Resilience, Security, and Cross-device

### RES-001 Missing env handling
Steps:
1. Remove one required env key in test env.
2. Call affected endpoint.
Expected:
- Clear error message, no data corruption.

### RES-002 External API timeout/retry
Steps:
1. Simulate temporary 429/5xx from provider.
Expected:
- Retry policy applies where configured.
- Final error returned cleanly if exhausted.

### RES-003 Browser refresh during long process
Steps:
1. Start chat capture and refresh mid-run.
Expected:
- No duplicated record from same event id.

### RES-004 Mobile chat behavior
Steps:
1. Open chat on mobile.
2. Scroll body and close chat.
Expected:
- Body lock/unlock works.

### RES-005 Tablet layout
Steps:
1. Test at ~768-1024 width.
Expected:
- Boards and cards remain readable; no overlapping controls.

### RES-006 Accessibility keyboard navigation
Steps:
1. Navigate controls via Tab/Shift+Tab.
2. Use Enter/Space on major buttons.
Expected:
- Focus states visible and actions accessible.

### RES-007 Data relation consistency
SQL checks:
```sql
select id,title,related_item_ids from tasks order by updated_at desc limit 50;
select id,title,related_item_ids from projects order by updated_at desc limit 50;
```
Expected:
- Relations reference valid parent ids where expected.

### RES-008 Archive lifecycle
Steps:
1. Complete -> archive -> search in archives.
Expected:
- Archived items are still queryable and restorable (if restore feature exists).

### RES-009 Resource save dedup sanity
Steps:
1. Save same Pulse article twice.
Expected:
- App prevents obvious duplicate spam (or marks duplicates clearly).

### RES-010 Production readiness signoff
Checklist:
1. No blocker defects in P0 flows.
2. Telegram parity verified.
3. Pulse policy/feedback verified.
4. Observability events visible.
5. Build and dry-run green.
Expected:
- Release candidate approved.

## 5. Test Run Log Template
Use this template per cycle.

```text
Cycle ID:
Date:
Environment:
Tester:

Executed Cases:
- <CASE_ID>: PASS/FAIL | notes

Defects:
- <DEFECT_ID> severity | steps | owner

Signoff:
- Ready / Not Ready
```

## 6. Suggested Execution Order (Fast to Full)
1. SETUP-001 -> SETUP-002
2. ONB-001..010
3. CHAT-001..010
4. TG-001..012
5. MOR-001..008
6. TP-001..014
7. AG-001..008
8. RES-001..010
