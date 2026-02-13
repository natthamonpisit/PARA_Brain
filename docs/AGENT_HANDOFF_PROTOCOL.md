# Agent Handoff Protocol (For Future "เจ" / Other Agents)

## 1) Source of Truth
- `docs/EXECUTION_ROADMAP.md` = phase order และ exit criteria
- `docs/AGENT_QUEUE.yaml` = current phase/task status แบบ machine-readable
- `docs/IMPLEMENTATION_STATE.md` = implementation milestone snapshot

## 2) Required Session Workflow
1. อ่าน `docs/AGENT_QUEUE.yaml`
2. เลือก task แรกที่ `status: ready`
3. ทำงานให้จบภายใน phase ปัจจุบันเท่านั้น
4. รัน validation/tests ที่เกี่ยวข้อง
5. อัปเดต `docs/AGENT_QUEUE.yaml`:
   - `status`
   - `notes`
   - `updated_at`
6. เขียนสรุปผลลัพธ์ + blockers

## 3) Status Vocabulary
- `todo`: ยังไม่เริ่ม
- `ready`: พร้อมเริ่มใน session นี้
- `in_progress`: กำลังทำ
- `blocked`: ติด dependency ภายนอก
- `done`: จบและผ่าน exit criteria

## 4) Definition of Done (DoD)
- โค้ด/สคริปต์รันได้จริงใน environment ปัจจุบัน
- มีผลลัพธ์ตรวจสอบได้ (ไฟล์/DB row/API response)
- มี log หรือข้อความ error ชัดเจนเมื่อ fail
- อัปเดต queue + state docs ครบ

## 5) Hard Constraints
- ห้ามข้าม phase โดยไม่ปิด phase ก่อนหน้า
- ห้ามแก้ unrelated features ระหว่างปิด phase
- ถ้าเจอ blocker ภายนอก (credential, migration, service down) ให้ mark `blocked` พร้อมเหตุผล

