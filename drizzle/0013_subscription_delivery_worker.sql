-- Durable retryable delivery worker; enum addition must precede use.
ALTER TYPE subscription_delivery_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TABLE subscription_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE subscription_deliveries ADD COLUMN IF NOT EXISTS lease_until timestamptz;
CREATE INDEX IF NOT EXISTS subscription_delivery_retry_idx ON subscription_deliveries (status, next_attempt_at);
