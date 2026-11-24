-- Durable engagement campaigns. No browser role has direct access to addresses or tokens.
CREATE TABLE public.campaign_recipient_lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_scope text NOT NULL, sender_scope text NOT NULL,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
 created_by_person_id uuid NOT NULL REFERENCES public.people(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_scope,id), UNIQUE(owner_scope,name)
);
--> statement-breakpoint
CREATE TABLE public.campaign_contacts (
 owner_scope text NOT NULL, email text NOT NULL CHECK (email=lower(email) AND length(email)<=254),
 consent_source text NOT NULL CHECK (length(consent_source) BETWEEN 1 AND 500),
 consent_at timestamptz NOT NULL DEFAULT now(),
 consent_by_person_id uuid NOT NULL REFERENCES public.people(id),
 PRIMARY KEY(owner_scope,email)
);
--> statement-breakpoint
CREATE TABLE public.campaign_list_members (
 owner_scope text NOT NULL, list_id uuid NOT NULL, email text NOT NULL,
 PRIMARY KEY(list_id,email),
 FOREIGN KEY(owner_scope,list_id) REFERENCES public.campaign_recipient_lists(owner_scope,id),
 FOREIGN KEY(owner_scope,email) REFERENCES public.campaign_contacts(owner_scope,email)
);
--> statement-breakpoint
CREATE TABLE public.campaign_suppressions (
 sender_scope text NOT NULL, email text NOT NULL,
 reason text NOT NULL CHECK(reason IN ('unsubscribe','bounce','complaint','provider_suppression')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(sender_scope,email)
);
--> statement-breakpoint
CREATE TABLE public.engagement_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_scope text NOT NULL, sender_scope text NOT NULL,
 engagement_id uuid NOT NULL REFERENCES public.engagement_definitions(id),
 link_id uuid NOT NULL REFERENCES public.site_go_links(id),
 list_id uuid NOT NULL, request_id uuid NOT NULL,
 subject text NOT NULL, body text NOT NULL, public_url text NOT NULL,
 sender_from text NOT NULL, sender_address text NOT NULL,
 created_by_person_id uuid NOT NULL REFERENCES public.people(id),
 scheduled_at timestamptz NOT NULL, cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_scope,id), UNIQUE(owner_scope,request_id),
 FOREIGN KEY(owner_scope,list_id) REFERENCES public.campaign_recipient_lists(owner_scope,id)
);
--> statement-breakpoint
CREATE TABLE public.campaign_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_scope text NOT NULL, campaign_id uuid NOT NULL, email text NOT NULL,
 unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','accepted','failed','suppressed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),
 first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid, lease_until timestamptz,
 provider_message_id text UNIQUE, accepted_at timestamptz, delivered_at timestamptz,
 provider_failure text CHECK(provider_failure IN ('email.bounced','email.complained','email.failed','email.suppressed')),
 UNIQUE(campaign_id,email),
 FOREIGN KEY(owner_scope,campaign_id) REFERENCES public.engagement_campaigns(owner_scope,id),
 FOREIGN KEY(owner_scope,email) REFERENCES public.campaign_contacts(owner_scope,email)
);
--> statement-breakpoint
CREATE INDEX campaign_deliveries_due_idx ON public.campaign_deliveries(next_attempt_at) WHERE status IN ('pending','processing');
CREATE INDEX engagement_campaigns_owner_idx ON public.engagement_campaigns(owner_scope,created_at DESC);
--> statement-breakpoint
ALTER TABLE public.campaign_recipient_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipient_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_list_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_suppressions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_recipient_lists,public.campaign_contacts,public.campaign_list_members,
 public.campaign_suppressions,public.engagement_campaigns,public.campaign_deliveries FROM PUBLIC, anonymous, authenticated;
