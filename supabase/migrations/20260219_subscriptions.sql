-- Migration: Subscriptions table
-- Tracks all services the user subscribes to, billing cycles, renewal dates, and costs.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  category          TEXT        NOT NULL DEFAULT 'Other',
  cost_monthly      NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_cycle     TEXT        NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('daily', 'weekly', 'monthly', 'yearly')),
  currency          TEXT        NOT NULL DEFAULT 'THB',
  start_date        DATE,
  renewal_date      DATE        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'active_unsubscribed', 'cancelled')),
  website           TEXT,
  account_email     TEXT,
  notes             TEXT,
  auto_renew        BOOLEAN     NOT NULL DEFAULT true,
  reminder_days     INTEGER     NOT NULL DEFAULT 7,
  linked_account_id UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status   ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal  ON subscriptions (renewal_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_category ON subscriptions (category);
