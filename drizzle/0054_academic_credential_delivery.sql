CREATE TABLE academic_credential_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 issuing_organization_id uuid NOT NULL REFERENCES organizations(id),
 transcript_issuance_id uuid REFERENCES transcript_issuances(id),
 diploma_issuance_id uuid REFERENCES diploma_issuances(id),
 recipient_email text NOT NULL,
 recipient_name text NOT NULL,
 requested_by_person_id uuid NOT NULL REFERENCES people(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','failed')),
 provider_message_id text,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT credential_delivery_exactly_one CHECK ((transcript_issuance_id IS NULL) <> (diploma_issuance_id IS NULL))
);
CREATE INDEX academic_delivery_issuer_idx ON academic_credential_deliveries(issuing_organization_id);
CREATE INDEX academic_delivery_status_idx ON academic_credential_deliveries(status);
