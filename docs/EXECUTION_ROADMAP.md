# PARA Brain Execution Roadmap (Session-Based)

> เป้าหมาย: ทำงานเป็นช่วงสั้นที่ปิดงานได้จริงใน 1 session และส่งต่องานให้ agent รอบถัดไปได้ทันที

## Priority Rules
1. งานที่ปลด blocker ระบบหลัก (DB schema / run path) มาก่อน
2. งานที่ทำให้ผู้ใช้ได้ value ทุกเช้า มาก่อนงาน feature เพิ่ม
3. งานที่ลดความเสี่ยงผิดพลาดอัตโนมัติ มาก่อนงานขยาย automation
4. งานที่วัดผลได้ (KPI) มาก่อนงานที่วัดผลยาก

## Session Capacity
- 1 session = 1 phase เท่านั้น (ถ้า phase ใหญ่ ให้แตกเป็น subtask ภายใน phase เดียว)
- ห้ามเปิด phase ใหม่จนกว่า phase ปัจจุบันมี `exit_criteria` ครบ

## Phases

### Phase A: Infra Unblock + Go-Live Path
**Priority:** P0  
**Why now:** ระบบยังรันจริงไม่ได้เพราะ schema ยังไม่พร้อม

**Tasks**
- Apply migration Phase 1 + 2 บน Supabase
- Verify tables/functions: `agent_runs`, `memory_chunks`, `memory_summaries`, `match_memory_chunks`
- Run smoke tests:
  - `npm run agent:ingest:no-embed`
  - `npm run agent:daily:dry`
  - `npm run agent:daily`
- Confirm output file + DB rows created

**Exit Criteria**
- Daily run สำเร็จอย่างน้อย 1 ครั้ง (status `SUCCESS`)
- Daily summary ถูกบันทึกใน `memory_summaries`
- Agent tab เปิดแล้วเห็น run และ summary ล่าสุด

---

### Phase B: Morning Workflow Reliability
**Priority:** P0  
**Why now:** คุณค่าหลักคือเปิดทุกเช้าแล้วใช้งานได้ทันที

**Tasks**
- ทำ `/api/agent-daily` ให้เรียกจาก UI ได้เสถียร (auth key flow)
- เพิ่ม UI state ชัดเจน: running/success/error + retry
- เพิ่ม fallback message เมื่อ context ไม่พอ
- เพิ่ม timestamp/timezone handling ให้สอดคล้องผู้ใช้

**Exit Criteria**
- กด Run Daily จาก UI แล้วผลลัพธ์ครบ 3 ครั้งติด
- ไม่มี silent fail (ทุก error ต้องเห็นใน UI หรือ run log)

---

### Phase C: Retrieval Quality (RAG v2)
**Priority:** P1  
**Why now:** เพิ่มคุณภาพคำแนะนำโดยไม่เพิ่ม token cost มาก

**Tasks**
- เปลี่ยน vector index เป็น HNSW (หรือ benchmark IVFFlat vs HNSW ก่อนเลือก)
- เพิ่ม hybrid retrieval (keyword + vector) หรืออย่างน้อย metadata filter + rerank
- เพิ่ม retrieval diagnostics ใน `metrics` (latency, hit count, source mix)

**Exit Criteria**
- Latency retrieval ไม่แย่ลงเกิน 20%
- คุณภาพสรุปดีขึ้นจาก manual spot-check (5 วันย้อนหลัง)

---

### Phase D: Capture Flow (Desktop + Mobile)
**Priority:** P1  
**Why now:** ลดงานคิดและจัดหมวดระหว่างวัน

**Tasks**
- ทำ quick capture 1 ช่องกรอก -> AI classify -> create task/project
- Mobile-first UX: ปุ่ม capture ชัด, ฟอร์มสั้น, submit เร็ว
- Add “inbox-like triage” สำหรับรายการที่จัดหมวดไม่มั่นใจ

**Exit Criteria**
- ผู้ใช้เพิ่มรายการใหม่ได้ <= 10 วินาทีบน mobile
- รายการที่ AI ไม่มั่นใจถูกโยนเข้า triage list แทนผิดหมวด

---

### Phase E: Automation + Heartbeat
**Priority:** P1  
**Why now:** ให้ระบบทำงานแทนผู้ใช้แบบปลอดภัย

**Tasks**
- สร้าง `heartbeat.md` contract (daily/weekly checks)
- ตั้ง schedule งานหลัก: morning brief, reminder, stale-project scan
- เพิ่ม approval gate สำหรับ action เสี่ยง (delete / finance / external push)

**Exit Criteria**
- งาน schedule วิ่งครบตามเวลาอย่างน้อย 7 วัน
- ไม่มี action เสี่ยงเกิดเองโดยไม่มี approval

---

### Phase F: OpenClaw / External Agent Integration
**Priority:** P2  
**Why now:** ขยายระบบอัตโนมัติหลัง core นิ่งแล้ว

**Tasks**
- ออกแบบ inbound job queue (`requested`, `approved`, `running`, `done`, `failed`)
- ทำ API contract สำหรับ external agent
- เพิ่ม audit trail ต่อ job/action

**Exit Criteria**
- External agent รับงานได้ 1 flow จบ end-to-end
- ทุก action trace ย้อนกลับได้

---

### Phase G: Personal Ops + Finance Autopilot
**Priority:** P2  
**Why now:** เพิ่มผลลัพธ์เชิงชีวิต/รายได้หลังระบบหลักนิ่ง

**Tasks**
- Weekly review template สำหรับงานประจำ + ad hoc + เงินสด
- Automation KPI: time saved, task closure rate, overdue reduction
- Financial action suggestions (proposal-only) พร้อม risk notes

**Exit Criteria**
- มี report รายสัปดาห์สม่ำเสมอ
- ผู้ใช้เห็น KPI ดีขึ้นอย่างน้อย 2 ตัวต่อเนื่อง 4 สัปดาห์

