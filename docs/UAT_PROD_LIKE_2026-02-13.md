# UAT Production-like (2026-02-13)

## Runtime under test
- Frontend: `dist` build
- API: local serverless harness invoking real handlers in `api/*.ts`
- Base URL: `http://127.0.0.1:4173`
- Date: `2026-02-13`

## Why this runtime
- `vercel dev` required credentials (`No existing credentials found`) and this machine had no `VERCEL_TOKEN`.
- To run full-path today, we used production-like local runtime:
  - built frontend (`npm run build`)
  - served app + `/api/*` from same origin
  - verified network calls hit `/api/capture-intake` and `/api/thailand-pulse` with `200`

---

## Scenario results

### 1) Chat reply (basic)
- Input: `สวัสดี production-like test ตอบกลับสั้นๆว่า online`
- Result: PASS
- Output: assistant replied `online`

### 2) Chat actionable -> create task
- Input: `...สร้าง task ชื่อ UAT_CHAT_TASK_FULLPATH_20260213 ...`
- Result: PASS
- Output in chat:
  - Assistant acknowledged create
  - `Saved to Database` card shown
  - Item title shown: `UAT_CHAT_TASK_FULLPATH_20260213`
- Data confirmation:
  - Task count increased (`Tasks 14 -> 15`)
  - Task appears in Mission lanes and queue cards

### 3) Mark done from detail panel (opened from dashboard card)
- Opened detail for `UAT_CHAT_TASK_FULLPATH_20260213`
- Clicked `Mark Done`
- Result: PASS
- Evidence:
  - Toast: `Completed: UAT_CHAT_TASK_FULLPATH_20260213`
  - Action switched to `Reopen`
  - Mission metrics refreshed (`Task completion` increased)

### 4) Thailand Pulse load + content quality
- Result: PASS (live RSS mode working)
- Snapshot metrics:
  - `Articles: 40`
  - `Trusted Sources: 12`
  - `Provider: RSS`
- Notes:
  - EXA/FIRECRAWL keys not set -> still usable, but enrichment limited.

### 5) Thailand Pulse -> Save to Resources
- Action: clicked save on politics article
- Result: PASS
- Evidence:
  - Toast shown (`Saved: ...`)
  - Left nav `Resources` increased (`3 -> 4`)

### 6) ESC behavior (chat overlay)
- Result: PASS (no blocker seen in this run)
- Note: UI snapshot format always includes minimized chat shell, so close-state was validated by absence of blocking overlay behavior during subsequent actions.

---

## Network/API evidence

From `.playwright-cli/network-2026-02-13T13-06-46-964Z.log`:
- `POST http://127.0.0.1:4173/api/capture-intake => [200] OK` (twice)
- `GET  http://127.0.0.1:4173/api/thailand-pulse?... => [200] OK`
- `GET  http://127.0.0.1:4173/api/thailand-pulse?mode=policy => [200] OK`
- `GET  http://127.0.0.1:4173/api/thailand-pulse?mode=history&days=7 => [200] OK`
- No `/api/capture-intake` `404` in this production-like run

From `.playwright-cli/console-2026-02-13T13-06-46-117Z.log`:
- 0 runtime errors during tested flows

---

## News parity check (today)

Topics seen in app:
- Thailand politics/election + กกต (BBC, Thai PBS, thestandard.co in feed cards)
- AI topic set includes query with `open source AI` and `GLM-5`

External checks aligned with app themes:
- GLM-5 official docs available:
  - https://docs.z.ai/guides/llm/glm-5
- GLM-5 ecosystem release coverage:
  - https://www.siliconflow.com/blog/glm-5-now-on-siliconflow-sota-open-source-model-built-for-agentic-engineering
- Thailand election/politics coverage:
  - https://apnews.com/article/thailand-general-election-2026-result-69186c8fce2df62e2bff0cc56234401e

Conclusion:
- Current app feed and external checks are directionally consistent on key topics (AI/GLM-5 and Thai election/กกต).

---

## Remaining risk
- This is production-like, not actual deployed Vercel runtime.
- Final pre-release confidence still requires one rerun on real Vercel environment (`vercel dev` or deployed preview URL) once credentials are available.
