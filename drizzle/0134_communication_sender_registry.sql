-- Platform-managed sender configuration, never provider credentials.
CREATE TABLE public.communication_sender_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 purpose text NOT NULL CHECK (purpose IN ('campaign')),
 sender_from text NOT NULL CHECK (length(sender_from) BETWEEN 3 AND 254 AND sender_from !~ '[[:cntrl:]]'),
 postal_address text NOT NULL CHECK (length(postal_address) BETWEEN 1 AND 500),
 verification_reference text NOT NULL CHECK (length(verification_reference) BETWEEN 5 AND 500),
 approved_by_person_id uuid NOT NULL REFERENCES public.people(id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_by_person_id uuid REFERENCES public.people(id),
 CHECK ((revoked_at IS NULL) = (revoked_by_person_id IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX communication_sender_active_purpose ON public.communication_sender_versions(purpose) WHERE revoked_at IS NULL;
ALTER TABLE public.communication_sender_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_sender_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.communication_sender_versions FROM PUBLIC, anonymous, authenticated;
