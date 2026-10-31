CREATE TABLE academic_credential_release_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 issuing_organization_id uuid NOT NULL REFERENCES organizations(id),
 transcript_issuance_id uuid REFERENCES transcript_issuances(id),
 diploma_issuance_id uuid REFERENCES diploma_issuances(id),
 recipient_person_id uuid NOT NULL REFERENCES people(id),
 recipient_email text NOT NULL,
 release_purpose text NOT NULL,
 instruction_reference text NOT NULL,
 consent_evidence_reference text NOT NULL,
 authorized_by_person_id uuid NOT NULL REFERENCES people(id),
 authorized_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT academic_release_exactly_one CHECK ((transcript_issuance_id IS NULL) <> (diploma_issuance_id IS NULL)),
 CONSTRAINT academic_release_valid_expiry CHECK (expires_at > authorized_at),
 CONSTRAINT academic_release_purpose_nonempty CHECK (length(btrim(release_purpose)) > 0),
 CONSTRAINT academic_release_instructions_nonempty CHECK (length(btrim(instruction_reference)) > 0),
 CONSTRAINT academic_release_consent_nonempty CHECK (length(btrim(consent_evidence_reference)) > 0)
);
CREATE INDEX academic_release_issuer_idx ON academic_credential_release_authorizations(issuing_organization_id);
CREATE INDEX academic_release_recipient_idx ON academic_credential_release_authorizations(recipient_person_id);
