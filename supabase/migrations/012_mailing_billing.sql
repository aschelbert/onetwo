-- 012_mailing_billing.sql
-- Add mailing-specific Stripe billing columns to financial_settings

alter table financial_settings
  add column if not exists mailing_stripe_customer_id   text,
  add column if not exists mailing_stripe_payment_method text,
  add column if not exists mailing_card_last4           text,
  add column if not exists mailing_card_brand            text;
