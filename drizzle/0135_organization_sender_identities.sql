-- Organization-specific campaign senders; null denotes the platform default.
ALTER TABLE public.communication_sender_versions ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
--> statement-breakpoint
CREATE UNIQUE INDEX communication_sender_active_organization ON public.communication_sender_versions(organization_id,purpose) WHERE revoked_at IS NULL AND organization_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX communication_sender_active_platform ON public.communication_sender_versions(purpose) WHERE revoked_at IS NULL AND organization_id IS NULL;
--> statement-breakpoint
DROP INDEX public.communication_sender_active_purpose;
--> statement-breakpoint
ALTER TABLE public.engagement_campaigns ADD COLUMN sender_version_id uuid REFERENCES public.communication_sender_versions(id);
