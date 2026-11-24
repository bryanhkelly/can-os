-- Additional hardening for 0105 Go Links. This migration contains NO
-- historical Site or Organization aliases. Only the server-issued /go code
-- may access the read-only public navigation gateway.
-- The application uses a server-only Neon connection that retains database
-- owner rights; anonymous and authenticated database roles get no table read.
ALTER TABLE "public"."site_go_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."site_go_links" FROM PUBLIC, anonymous, authenticated;
