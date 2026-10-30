CREATE TABLE IF NOT EXISTS subscription_event_receipts (event_id uuid PRIMARY KEY REFERENCES domain_events(id) ON DELETE CASCADE, processed_at timestamptz NOT NULL DEFAULT now());
