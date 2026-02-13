# Next Session Tuning Backlog

## Scope
รายการนี้คือ tuning งานที่ควรทำทันทีหลัง Phase A-G เพื่อให้ระบบเร็วขึ้น เสถียรขึ้น และพร้อม E2E/production มากขึ้น

## Status Update (2026-02-13)
- P0 completed:
  - Frontend bundle split (lazy import boards/chat + vendor chunks)
  - Agent query slimming (`hooks/useAgentData.ts`)
  - Shared timeout/retry policy for LINE/Gemini endpoint paths
- Verification completed:
  - `npm run build` passed
  - `npm run agent:daily:dry` passed
  - `npm run agent:heartbeat` passed
- Additional parallel progress:
  - UX Mission Control V1 shipped (dashboard redesign + focus queue + floating chat widget)
  - Telegram migration completed (LINE removed) + Telegram logs now appear in web chat stream
  - Remaining gap: special cards (created item card, etc.) are still not generated directly from Telegram logs
  - Thailand Pulse Phase 1.2 completed:
    - Web MCP provider layer (`EXA` + `Firecrawl` + RSS fallback)
    - Citation rendering in UI and provider labeling
    - Supabase snapshot persistence + history API sync (`pulse_snapshots`)
    - 12-hour cron endpoint + Vercel schedule

## Priority P0 (ต้องทำก่อน)
1. Frontend bundle split
- ปัญหา: `vite build` เตือน bundle > 500KB
- งาน:
  - แยก `AgentBoard`, `ReviewBoard`, `FinanceBoard`, `ChatPanel` ด้วย lazy import
  - split vendor chunk (`react`, `@google/genai`, `supabase`)
- KPI:
  - main chunk ลดลงอย่างน้อย 25%
  - first-load เร็วขึ้นชัดเจนในเครื่องจริง

2. Agent query slimming
- ปัญหา: Agent tab ดึง `select('*')` หลายจุด
- งาน:
  - เปลี่ยนเป็น select เฉพาะ fields ที่ใช้จริงใน `hooks/useAgentData.ts`
  - จำกัด limit และ order ให้เหมาะกับหน้าปัจจุบัน
- KPI:
  - เวลา refresh Agent tab ลดลง >= 30%

3. Add API timeout/retry policy (server endpoints)
- ปัญหา: endpoint บางจุดยังไม่มี timeout/retry policy แบบชัดเจน
- งาน:
  - ตั้ง timeout กลางสำหรับ external API calls (Telegram/Gemini)
  - ใส่ retry เฉพาะ error ที่ควร retry (429/5xx)
- KPI:
  - ลด failed run จาก transient error

**Current state:** `done`

## Telegram Bridge Parity Backlog (New)
1. Convert Telegram system logs into structured chat events with operation metadata
- ปัญหา: ตอนนี้ chat ดึงแค่ข้อความ ทำให้การ์ดพิเศษ (created item card ฯลฯ) ไม่ขึ้นจาก Telegram โดยตรง
- งาน:
  - บันทึก operation/type/payload reference ต่อ interaction ใน `system_logs` หรือ table mapping
  - map structured event เป็น `ChatMessage.createdItem/createdItems` ในฝั่ง UI
- KPI:
  - Telegram interaction ที่สร้าง item/transaction/module แสดงการ์ดเทียบเท่ากับ web chat

2. Idempotency for inbound Telegram updates
- ปัญหา: replay/update ซ้ำจาก Telegram webhook อาจสร้าง card หรือรายการซ้ำ
- งาน:
  - เก็บ update id แล้วกันซ้ำระดับ DB/API
- KPI:
  - ไม่มี duplicate create จาก event เดิม

## Priority P1 (ทำต่อจาก P0)
4. Retrieval tuning (real data)
- งาน:
  - เพิ่ม benchmark รอบข้อมูลจริงมากขึ้น (`--samples=50/100`)
  - เปรียบเทียบ HNSW/IVFFlat เป็นรอบ ๆ และกำหนด index policy เดียว
- KPI:
  - p95 retrieval latency ดีขึ้นและคงที่

5. DB index review (hot queries)
- งาน:
  - ตรวจ query ที่ใช้บ่อยใน `agent_runs`, `memory_summaries`, `tasks`
  - เพิ่ม composite indexes ที่ขาด
- KPI:
  - ลด query latency หน้า Agent + Dashboard

6. Observability baseline
- งาน:
  - เพิ่ม structured logs สำหรับ cron/agent job APIs
  - เก็บ latency และ error rate ต่อ endpoint
- KPI:
  - debug production issue ได้ใน < 10 นาที

## Thailand Pulse Quality Backlog (New)
1. Source allow/deny policy
- งาน:
  - เพิ่ม user-configurable allowlist/denylist สำหรับ publisher domain
- KPI:
  - ลดข่าว noise/low-trust ใน feed ได้ชัดเจน

2. Confidence scoring formula
- งาน:
  - คำนวณ score ต่อข่าวจาก (trust tier + corroboration count + freshness)
  - แสดง score พร้อมเหตุผลแบบสั้น
- KPI:
  - ranking ของข่าวตรงความสำคัญผู้ใช้มากขึ้น

3. Relevance feedback loop
- งาน:
  - เพิ่มปุ่ม `relevant` / `not relevant` และบันทึก feedback
  - ใช้ feedback ปรับ ranking ในรอบถัดไป
- KPI:
  - CTR บนข่าวที่ถูก save เพิ่มขึ้น

## Priority P2 (หลัง E2E)
7. In-memory / edge cache strategy
- งาน:
  - cache read-only endpoints ที่เรียกซ้ำ
  - cache invalidation เมื่อ run ใหม่สำเร็จ

8. Background job isolation
- งาน:
  - แยก long-running tasks จาก request path เพื่อกัน timeout

## Recommended Execution Order (Next Session)
1. Telegram parity backlog ข้อ 1 (special card generation from Telegram logs)
2. Telegram parity backlog ข้อ 2 (idempotency against duplicate updates)
3. P1-4 Retrieval tuning (real data benchmark 50/100 samples)
4. P1-5 DB index review for hot queries (`agent_runs`, `memory_summaries`, `tasks`)
5. P1-6 Observability baseline (structured logs + endpoint latency/error rate)
6. Quick verify: `npm run build` + `agent:daily:dry` + `agent:heartbeat`

## Definition of Done (Next Session)
- p95 retrieval latency ดีขึ้นและมี baseline เปรียบเทียบรอบใหม่
- hot queries สำคัญมี index coverage ที่ชัดเจน
- endpoint logs ช่วย trace failures ได้รวดเร็ว
- mission-control UI ไม่มี responsive/blocking regression ที่สำคัญ
