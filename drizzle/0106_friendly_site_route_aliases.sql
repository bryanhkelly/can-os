-- Governed routing aliases, not website publication aliases or authorization.
-- The two slugs form a stable private workspace address; old pairs stay owned
-- by their original Site when the current Site/Organization slug changes.
CREATE TABLE IF NOT EXISTS "site_route_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "organization_slug" text NOT NULL,
  "site_slug" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_route_aliases_address_uq"
  ON "site_route_aliases" ("organization_slug", "site_slug");
CREATE INDEX IF NOT EXISTS "site_route_aliases_site_idx"
  ON "site_route_aliases" ("site_id");

-- No public or unauthenticated route-alias list API.
ALTER TABLE "site_route_aliases" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "site_route_aliases" FROM PUBLIC;

-- Every existing canonical Site receives its current stable URL.
INSERT INTO "site_route_aliases"
  ("organization_id","site_id","organization_slug","site_slug")
SELECT s."organization_id",s."id",o."slug",s."slug"
FROM "sites" s INNER JOIN "organizations" o ON o."id"=s."organization_id"
ON CONFLICT ("organization_slug","site_slug") DO NOTHING;

-- Enforce alias registration for ALL canonical Site insert/rename paths, not
-- just the website editor. Cross-Site reuse of historical addresses fails.
CREATE OR REPLACE FUNCTION "register_site_route_alias"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $site_alias$
DECLARE parent_slug text;
BEGIN
  SELECT o."slug" INTO parent_slug FROM "organizations" o
    WHERE o."id"=NEW."organization_id";
  IF parent_slug IS NULL THEN
    RAISE EXCEPTION 'Site route alias requires an existing Organization';
  END IF;
  INSERT INTO "site_route_aliases"
    ("organization_id","site_id","organization_slug","site_slug")
  VALUES (NEW."organization_id", NEW."id", parent_slug, NEW."slug")
  ON CONFLICT ("organization_slug","site_slug")
    DO UPDATE SET "site_id"=EXCLUDED."site_id"
    WHERE "site_route_aliases"."site_id"=EXCLUDED."site_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This Site route address is reserved for a different Site'
      USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$site_alias$;
DROP TRIGGER IF EXISTS "sites_route_alias_sync" ON "sites";
CREATE TRIGGER "sites_route_alias_sync"
  AFTER INSERT OR UPDATE OF "slug","organization_id" ON "sites"
  FOR EACH ROW EXECUTE FUNCTION "register_site_route_alias"();

-- Changing an Organization slug creates new working URLs without invalidating
-- previous links. Existing aliases for that Organization remain reserved.
CREATE OR REPLACE FUNCTION "register_organization_route_aliases"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $organization_alias$
DECLARE row RECORD;
BEGIN
  FOR row IN SELECT DISTINCT a."site_id",s."organization_id",a."site_slug"
    FROM "site_route_aliases" a
    JOIN "sites" s ON s."id"=a."site_id"
    WHERE s."organization_id"=NEW."id"
  LOOP
    INSERT INTO "site_route_aliases"
      ("organization_id","site_id","organization_slug","site_slug")
    VALUES (NEW."id",row."site_id",NEW."slug",row."site_slug")
    ON CONFLICT ("organization_slug","site_slug")
      DO UPDATE SET "site_id"=EXCLUDED."site_id"
      WHERE "site_route_aliases"."site_id"=EXCLUDED."site_id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This Organization route address is reserved for another Site'
        USING ERRCODE='23505';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$organization_alias$;
DROP TRIGGER IF EXISTS "organizations_route_alias_sync" ON "organizations";
CREATE TRIGGER "organizations_route_alias_sync"
  AFTER UPDATE OF "slug" ON "organizations"
  FOR EACH ROW WHEN (OLD."slug" IS DISTINCT FROM NEW."slug")
  EXECUTE FUNCTION "register_organization_route_aliases"();

-- These trigger functions are not public application endpoints.
REVOKE ALL ON FUNCTION "register_site_route_alias"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "register_organization_route_aliases"() FROM PUBLIC;
