-- Current credential provenance must be explicit on new sessions.
-- Legacy sessions remain nullable; they cannot authenticate private-code Accounts.
ALTER TABLE public.access_sessions ADD COLUMN authentication_method text;
--> statement-breakpoint
ALTER TABLE public.access_sessions ADD CONSTRAINT access_sessions_authentication_method_ck
 CHECK (authentication_method IS NULL OR authentication_method IN ('email_link','local_demo_code','private_access_code'));
