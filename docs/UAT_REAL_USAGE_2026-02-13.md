# UAT Real Usage Report (2026-02-13)

## Scope
- Verify chat response behavior in real UI usage
- Verify task capture/creation from user-like inputs
- Verify task completion flows (`dashboard/list/detail`)
- Verify Thailand Pulse news experience and compare with external current news signals

## Environment
- App URL: `http://127.0.0.1:5173`
- Build mode under test: `vite dev` (not Vercel serverless runtime)
- Date tested: `2026-02-13`

---

## UAT Scenario Matrix

### 1) Chat widget: AI should respond
- Steps:
  1. Open top-right `Chat`.
  2. Send: `สวัสดี ลองตอบกลับสั้นๆว่ารับข้อความแล้ว`
- Expected:
  - AI returns reply in chat within a few seconds.
- Actual:
  - PASS. AI replied: `สวัสดีครับ เจรับทราบข้อความแล้วครับ...`
- Notes:
  - Console still shows `/api/capture-intake` 404 and fallback analyzer warning (expected in vite-only runtime).

### 2) Chat widget: long actionable message should be analyzed and converted
- Steps:
  1. Send: `สมมุติ: พรุ่งนี้ต้องโทรหาธนาคารเรื่อง refinance บ้าน ... ช่วยสร้าง task ให้หน่อย`
- Expected:
  - AI analyzes intent and creates at least one task.
  - Chat returns completion response.
- Actual:
  - FAIL (intermittent blocker). Message stuck at `Analyzing...` and input remains disabled.
- Evidence:
  - Console error shows `AI Error: TypeError: Failed to fetch` from `@google_genai` path.

### 3) Command capture: create task from user-like text
- Steps:
  1. In `Command capture` field enter:
     - `UAT capture: สร้าง task ชื่อ UAT_TASK_20260213_TEST และกำหนด due date พรุ่งนี้`
  2. Click `Capture`.
- Expected:
  - New task created and visible in task lists.
- Actual:
  - PASS.
  - Toast: `Captured as Tasks`.
  - Left nav task count increased (`12 -> 13`).
  - New task visible in Mission/Tasks views.

### 4) Task done flow: from task list (checkbox + batch complete)
- Steps:
  1. Open `Tasks`.
  2. Check `สร้าง task UAT_TASK_20260213_TEST`.
  3. Click `Complete Selected`.
- Expected:
  - Task status becomes completed.
- Actual:
  - PASS.
  - Toast: `Batch complete success`.
  - Task detail action changed to `Reopen`.

### 5) Task done flow: from task detail (`Mark Done`)
- Steps:
  1. Open task detail for `ส่งเมล์`.
  2. Click `Mark Done`.
- Expected:
  - Status moves to done and can be reopened.
- Actual:
  - PASS.
  - Toast: `Completed: ส่งเมล์`.
  - Detail action changed to `Reopen`.

### 6) Mission dashboard path: open task from dashboard and complete
- Steps:
  1. Go `Mission`.
  2. Click a task in `Focus Now`.
  3. In detail panel click `Mark Done`.
- Expected:
  - Dashboard metrics/lane counts update immediately.
- Actual:
  - PASS.
  - Overdue and completion metrics updated live.

### 7) Chat UX: ESC closes floating chat
- Steps:
  1. Open chat.
  2. Press `Esc`.
- Expected:
  - Floating panel closes.
- Actual:
  - PASS.

### 8) Thailand Pulse: save to resource
- Steps:
  1. Open `Thailand Pulse`.
  2. Click `Save to Resources` on AI card.
  3. Open `Resources`.
- Expected:
  - Resource count increases and item appears.
- Actual:
  - PASS.
  - Resource count increased (`2 -> 3`).
  - New resource created: `No live articles for AI right now`.

---

## Thailand Pulse Quality Check (Real-world Readiness)

### App-side findings during UAT
- Snapshot provider shown as `FALLBACK`.
- `Trusted Sources` = `0`.
- Category cards show placeholder message: `No live articles for ... right now`.
- Trend Radar shows keywords:
  - `Open Source AI`
  - `GLM-5`
  - `กกต`

### External quick-check (same day signals)
- Thailand politics/election signals are active (AP coverage of Thai election outcome and coalition dynamics).
- Election Commission (EC/กกต) election readiness and Feb 8 election process appears in official/government and Thai media pages.
- Open-source AI topic around GLM-5 exists in official model docs/ecosystem pages, but Thai-local “top headline” evidence is weaker than politics in sampled sources.

### Verdict
- Current page is usable for manual save flow and trend hints.
- It is not yet reliable as a “live daily intel page” because it is operating in fallback mode with no live source coverage data.

---

## Blockers & Risks
- `P1` Chat analysis intermittently stalls on actionable messages:
  - Symptom: `Analyzing...` never resolves.
  - Console: `AI Error: TypeError: Failed to fetch` from Gemini SDK path.
- `P1` `/api/capture-intake` not available in current vite-only runtime:
  - 404 fallback path is used.
  - This limits realism of end-to-end server API UAT.
- `P2` Thailand Pulse live feed unavailable:
  - Provider remains `FALLBACK`.
  - Trusted source scoring and source coverage cannot be validated end-to-end.

---

## Recommended Next Fix Order
1. Stabilize chat analyzer network path (add timeout + retry + explicit user-facing error state + input unlock guard).
2. Run UAT on runtime that serves `/api/*` (Vercel dev or equivalent local serverless runtime).
3. Restore Thailand Pulse live ingestion first, then rerun trend/source-confidence UAT with allow/deny domain policy enabled.
