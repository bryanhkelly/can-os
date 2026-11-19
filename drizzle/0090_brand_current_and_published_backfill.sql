-- One-time non-destructive import of existing Site website Brand choices.
-- No historical website prototype revisions are preserved: only the last
-- published identity (where different) and the current saved identity.
-- Do not erase legacy JSON until a separate checked cutover has passed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TEMP TABLE can_brand_source ON COMMIT DROP AS
WITH published AS (
  SELECT DISTINCT ON (site_id)
    site_id, revision, content, created_by_person_id
  FROM site_local_content_versions
  WHERE status='published' AND jsonb_typeof(content->'branding')='object'
  ORDER BY site_id,revision DESC
), saved AS (
  SELECT DISTINCT ON (site_id)
    site_id, revision, content, created_by_person_id
  FROM site_local_content_versions
  WHERE jsonb_typeof(content->'branding')='object'
  ORDER BY site_id,revision DESC
)
SELECT p.site_id,p.revision,p.content,p.created_by_person_id,
  'published'::text AS source,1 AS priority
FROM published p
UNION ALL
SELECT s.site_id,s.revision,s.content,s.created_by_person_id,
  'saved'::text,2
FROM saved s
WHERE NOT EXISTS (
  SELECT 1 FROM published p
  WHERE p.site_id=s.site_id AND p.content->'branding'=s.content->'branding'
);
--> statement-breakpoint
DO $$
DECLARE
 source_row RECORD;
 site_name text;
 visual jsonb;
 config jsonb;
 picture jsonb;
 media_key text;
 image_id uuid;
 image_sha text;
 image_text text;
 new_version_id uuid;
 brand_number int;
 brand_sha text;
BEGIN
 FOR source_row IN SELECT * FROM can_brand_source ORDER BY site_id,priority LOOP
   SELECT name INTO site_name FROM sites WHERE id=source_row.site_id;
   visual := source_row.content->'branding';
   config:=jsonb_build_object(
     'directionId', CASE WHEN visual->>'brandDirectionId' IN
       ('belonging','excellence','innovation','classical','creative','leadership')
       THEN visual->>'brandDirectionId' ELSE NULL END,
     'paletteId',CASE WHEN visual->>'paletteId' IN
       ('signature','heritage','forest','copper','coastal','harbor',
        'brand-heritage','brand-community','brand-modern','brand-bright-futures',
        'brand-summit','brand-classic','brand-campus')
       THEN visual->>'paletteId' ELSE 'signature' END,
     'typographyId',CASE WHEN visual->>'typographyId' IN
       ('editorial','traditional','contemporary')
       THEN visual->>'typographyId' ELSE 'editorial' END,
     'headingFontId', CASE WHEN visual->>'headingFontId' IN
       ('georgia','cambria','palatino','times','arial','verdana','trebuchet','system')
       THEN visual->>'headingFontId' ELSE NULL END,
     'bodyFontId', CASE WHEN visual->>'bodyFontId' IN
       ('georgia','cambria','palatino','times','arial','verdana','trebuchet','system')
       THEN visual->>'bodyFontId' ELSE NULL END,
     'displayName',COALESCE(NULLIF(left(trim(site_name),120),''),'Learning community'),
     'logoAssetId',NULL,'heroAssetId',NULL
   );
   FOR media_key IN SELECT unnest(ARRAY['logoImage','heroImage']) LOOP
     picture := visual->media_key;
     IF picture IS NULL OR picture='null'::jsonb THEN CONTINUE; END IF;
     image_text:=picture->>'dataUrl';
     IF image_text IS NULL OR image_text !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' OR length(image_text)>220000 THEN
       RAISE EXCEPTION 'Existing Site brand asset requires manual review before cutover: %, %',
         source_row.site_id,media_key;
     END IF;
     image_sha:=encode(digest(picture::text,'sha256'),'hex');
     SELECT id INTO image_id FROM site_brand_assets
       WHERE site_id=source_row.site_id AND checksum=image_sha LIMIT 1;
     IF image_id IS NULL THEN
       INSERT INTO site_brand_assets(site_id,data_url,checksum,alt_text,rights_confirmed,
         child_image_consent,created_by_person_id)
       VALUES(source_row.site_id,image_text,image_sha,COALESCE(picture->>'altText',''),
         CASE WHEN picture->>'rightsConfirmed'='true' THEN 'true' ELSE 'false' END,
         COALESCE(picture->>'childImageConsent','unconfirmed'),source_row.created_by_person_id)
       RETURNING id INTO image_id;
     END IF;
     config:=jsonb_set(config,
       CASE media_key WHEN 'logoImage' THEN ARRAY['logoAssetId'] ELSE ARRAY['heroAssetId'] END,
       to_jsonb(image_id::text));
     image_id:=NULL;
   END LOOP;
   SELECT COALESCE(MAX(revision),0)+1 INTO brand_number FROM site_brand_versions
     WHERE site_id=source_row.site_id;
   brand_sha:=encode(digest(config::text,'sha256'),'hex');
   INSERT INTO site_brand_versions(site_id,revision,configuration,fingerprint,created_by_person_id)
   VALUES(source_row.site_id,brand_number,config,brand_sha,source_row.created_by_person_id)
   RETURNING id INTO new_version_id;
   UPDATE sites SET current_brand_version_id=new_version_id
      WHERE id=source_row.site_id;
   IF source_row.source='published' THEN
     UPDATE site_publications SET
       brand_version_id=new_version_id,
       website_content_revision=source_row.revision,
       website_template_id=COALESCE(NULLIF(visual->>'templateId',''),'heritage'),
       website_template_version=1
     WHERE site_id=source_row.site_id AND status='published';
   END IF;
 END LOOP;
END $$;
--> statement-breakpoint
-- Required operator inventory, prior to retiring the old embedded Brand:
-- SELECT count(*) FROM site_local_content_versions
--   WHERE jsonb_typeof(content->'branding')='object';
-- SELECT count(*) FROM sites WHERE current_brand_version_id IS NOT NULL;
-- SELECT count(*) FROM site_publications
--   WHERE status='published' AND brand_version_id IS NULL;
-- No destructive delete of Brand content is authorized in this migration.
