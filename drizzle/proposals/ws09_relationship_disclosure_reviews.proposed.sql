-- PROPOSAL ONLY: not registered in the migration ledger or applied.
-- Requires reviewed independent reviewer authority, immutable complete source
-- manifests and release-history review before enabling ANY writer or reader.
BEGIN;
CREATE TABLE public.relationship_disclosure_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_organization_id uuid NOT NULL REFERENCES public.organizations(id),
 population text NOT NULL CHECK(population IN ('real','synthetic')),
 scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),
 manifest_digest text NOT NULL CHECK(manifest_digest ~ '^[a-f0-9]{64}$'),
 review_evidence_digest text NOT NULL CHECK(review_evidence_digest ~ '^[a-f0-9]{64}$'),
 prepared_by_person_id uuid NOT NULL REFERENCES public.people(id),
 reviewed_by_person_id uuid NOT NULL REFERENCES public.people(id),
 prepared_at timestamptz NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at timestamptz NOT NULL,
 source_completeness_reviewed boolean NOT NULL CHECK(source_completeness_reviewed),
 suppress_small_cells boolean NOT NULL CHECK(suppress_small_cells),
 reviewed_overlapping_cuts boolean NOT NULL CHECK(reviewed_overlapping_cuts),
 reviewed_historical_differencing boolean NOT NULL CHECK(reviewed_historical_differencing),
 CHECK(prepared_by_person_id<>reviewed_by_person_id),
 CHECK(prepared_at<=approved_at AND approved_at<expires_at)
);
CREATE INDEX relationship_disclosure_reviews_scope_idx ON public.relationship_disclosure_reviews
 (recipient_organization_id,population,scope_digest,approved_at DESC);
CREATE TABLE public.relationship_disclosure_review_revocations (
 review_id uuid PRIMARY KEY REFERENCES public.relationship_disclosure_reviews(id),
 revoked_by_person_id uuid NOT NULL REFERENCES public.people(id),
 revoked_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reason_code text NOT NULL CHECK(reason_code IN ('source_changed','authority_changed','privacy_review','review_error','other'))
);
ALTER TABLE public.relationship_disclosure_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_disclosure_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_disclosure_review_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_disclosure_review_revocations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.relationship_disclosure_reviews,public.relationship_disclosure_review_revocations FROM PUBLIC,anonymous,authenticated;
-- Deliberately no service role policies or grants until independent authority
-- and writer acceptance are established. No client can insert attestations.
CREATE FUNCTION public.prevent_relationship_disclosure_review_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $guard$
BEGIN
 RAISE EXCEPTION 'Disclosure reviews and revocations are append-only';
END;
$guard$;
CREATE TRIGGER relationship_disclosure_review_immutable BEFORE UPDATE OR DELETE
 ON public.relationship_disclosure_reviews FOR EACH ROW EXECUTE FUNCTION public.prevent_relationship_disclosure_review_mutation();
CREATE TRIGGER relationship_disclosure_revocation_immutable BEFORE UPDATE OR DELETE
 ON public.relationship_disclosure_review_revocations FOR EACH ROW EXECUTE FUNCTION public.prevent_relationship_disclosure_review_mutation();
REVOKE ALL ON FUNCTION public.prevent_relationship_disclosure_review_mutation() FROM PUBLIC,anonymous,authenticated;
COMMIT;
