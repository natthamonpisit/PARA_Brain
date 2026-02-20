-- JAY Memory & Learning System
-- memory: สิ่งที่ JAY จำเกี่ยวกับพี่นัทระยะยาว (preference, pattern, context)
-- learning: สิ่งที่ JAY เรียนรู้จากการ interact แต่ละครั้ง (ผิด/ถูก/pattern ใหม่)

-- ─── JAY MEMORY ──────────────────────────────────────────────────────────────
-- Key-value store สำหรับ long-term memory เกี่ยวกับ user
-- JAY เขียนและอ่านเอง เพื่อจำข้อมูลที่สำคัญข้ามบทสนทนา

CREATE TABLE IF NOT EXISTS jay_memory (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL UNIQUE,   -- e.g. "preferred_project_for_ai_tasks", "typical_work_hours"
  value       TEXT        NOT NULL,          -- free-text value
  category    TEXT        NOT NULL DEFAULT 'general'
    CHECK (category IN ('preference','pattern','fact','project_context','finance','relationship','other')),
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 0.80
    CHECK (confidence >= 0 AND confidence <= 1),
  source      TEXT,                          -- e.g. "inferred_from_telegram", "user_stated_explicitly"
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jay_memory_category ON jay_memory (category);
CREATE INDEX IF NOT EXISTS idx_jay_memory_last_seen ON jay_memory (last_seen DESC);

-- ─── JAY LEARNING ────────────────────────────────────────────────────────────
-- Log ของสิ่งที่ JAY เรียนรู้จากแต่ละ interaction
-- เช่น "user แก้ operation ที่ฉัน classify ผิด" → เรียนรู้ว่าควรทำยังไงครั้งต่อไป

CREATE TABLE IF NOT EXISTS jay_learning (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson          TEXT        NOT NULL,      -- สิ่งที่เรียนรู้ ภาษาไทย/อังกฤษ
  trigger_message TEXT,                      -- ข้อความที่ทำให้เรียนรู้
  outcome         TEXT        NOT NULL
    CHECK (outcome IN ('correction','confirmation','new_pattern','preference_update','error_avoided')),
  category        TEXT        NOT NULL DEFAULT 'classification'
    CHECK (category IN ('classification','tone','routing','finance','reminder','chitchat','capability','other')),
  applied_count   INTEGER     NOT NULL DEFAULT 0,  -- ถูกนำไปใช้กี่ครั้งแล้ว
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE, -- ยังใช้งานอยู่ไหม
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jay_learning_category  ON jay_learning (category);
CREATE INDEX IF NOT EXISTS idx_jay_learning_active     ON jay_learning (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jay_learning_outcome    ON jay_learning (outcome);
