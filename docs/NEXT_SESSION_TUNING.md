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
  - ตั้ง timeout กลางสำหรับ external API calls (LINE/Gemini)
  - ใส่ retry เฉพาะ error ที่ควร retry (429/5xx)
- KPI:
  - ลด failed run จาก transient error

**Current state:** `done`

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

## Priority P2 (หลัง E2E)
7. In-memory / edge cache strategy
- งาน:
  - cache read-only endpoints ที่เรียกซ้ำ
  - cache invalidation เมื่อ run ใหม่สำเร็จ

8. Background job isolation
- งาน:
  - แยก long-running tasks จาก request path เพื่อกัน timeout

## Recommended Execution Order (Next Session)
1. P1-4 Retrieval tuning (real data benchmark 50/100 samples)
2. P1-5 DB index review for hot queries (`agent_runs`, `memory_summaries`, `tasks`)
3. P1-6 Observability baseline (structured logs + endpoint latency/error rate)
4. Quick verify: `npm run build` + `agent:daily:dry` + `agent:heartbeat`
5. UI manual smoke for mission-control pages + floating chat behavior

## Definition of Done (Next Session)
- p95 retrieval latency ดีขึ้นและมี baseline เปรียบเทียบรอบใหม่
- hot queries สำคัญมี index coverage ที่ชัดเจน
- endpoint logs ช่วย trace failures ได้รวดเร็ว
- mission-control UI ไม่มี responsive/blocking regression ที่สำคัญ
