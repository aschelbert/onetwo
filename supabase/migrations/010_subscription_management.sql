-- 010_subscription_management.sql
-- Add 'churned' to tenant_status enum and cancel_at_period_end to subscriptions

-- Add 'churned' value to tenant_status enum
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'churned';

-- Add cancel_at_period_end column to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false;
