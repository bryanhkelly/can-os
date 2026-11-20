-- Canonical Site Brand cutover. No Site data or historical revisions are deleted.
-- A Site without website revisions remains unbranded until its first authorized save.
-- A published Site MUST have a real published content source and an attributed
-- author; fail the migration before changing any data otherwise.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
DO $$
DECLARE
  source_row record;
  config jsonb;
  visual jsonb;
  picture jsonb;
  media_key text;
  image_id uuid;
  image_sha text;
  image_text text;
  new_version_id uuid;
  brand_number integer;
  brand_sha text;
  published_source_count integer;
BEGIN
  SELECT count(*) INTO published_source_count
  FROM site_publications publication
  WHERE publication.status = 'published'
    AND NOT EXISTS (
      SELECT 1 FROM site_local_content_versions revision
      WHERE revision.site_id = publication.site_id
        AND revision.status = 'published'
        AND revision.created_by_person_id IS NOT NULL
    );
  IF published_source_count > 0 THEN
    RAISE EXCEPTION
      'Site Brand cutover blocked: % published Sites lack attributable published website revisions. Inspect before applying.',
      published_source_count;
  END IF;

  FOR source_row IN
    WITH published AS (
      SELECT DISTINCT ON (publication.site_id)
        publication.site_id, revision.revision, revision.content,
        revision.created_by_person_id, site.name AS site_name,
        'published'::text AS source, 1 AS priority,
        COALESCE(
          CASE WHEN jsonb_typeof(revision.content->'branding')='object'
            THEN revision.content->'branding' END,
          (SELECT older.content->'branding' FROM site_local_content_versions older
           WHERE older.site_id=publication.site_id
             AND older.status='published'
             AND older.revision<=revision.revision
             AND jsonb_typeof(older.content->'branding')='object'
           ORDER BY older.revision DESC LIMIT 1),
          '{}'::jsonb
        ) AS visual
      FROM site_publications publication
      JOIN sites site ON site.id=publication.site_id
      JOIN site_local_content_versions revision ON revision.site_id=publication.site_id
        AND revision.status='published'
      WHERE publication.status='published'
      ORDER BY publication.site_id,revision.revision DESC
    ), latest AS (
      SELECT DISTINCT ON (revision.site_id)
        revision.site_id, revision.revision, revision.content,
        revision.created_by_person_id, site.name AS site_name,
        'saved'::text AS source, 2 AS priority,
        COALESCE(
          CASE WHEN jsonb_typeof(revision.content->'branding')='object'
            THEN revision.content->'branding' END,
          (SELECT older.content->'branding' FROM site_local_content_versions older
           WHERE older.site_id=revision.site_id
             AND older.revision<=revision.revision
             AND jsonb_typeof(older.content->'branding')='object'
           ORDER BY older.revision DESC LIMIT 1),
          '{}'::jsonb
        ) AS visual
      FROM site_local_content_versions revision
      JOIN sites site ON site.id=revision.site_id
      ORDER BY revision.site_id, revision.revision DESC
    )
    SELECT * FROM published
    UNION ALL
    SELECT latest.* FROM latest
    WHERE NOT EXISTS (
      SELECT 1 FROM published
      WHERE published.site_id=latest.site_id
        AND published.visual=latest.visual
    )
    ORDER BY site_id, priority
  LOOP
    visual:=source_row.visual;
    config:=jsonb_build_object(
      'directionId', CASE WHEN visual->>'brandDirectionId' IN
        ('belonging','excellence','innovation','classical','creative','leadership')
        THEN visual->>'brandDirectionId' ELSE NULL END,
      'paletteId', CASE WHEN visual->>'paletteId' IN
        ('signature','heritage','forest','copper','coastal','harbor',
         'brand-heritage','brand-community','brand-modern','brand-bright-futures',
         'brand-summit','brand-classic','brand-campus')
        THEN visual->>'paletteId' ELSE 'signature' END,
      'typographyId', CASE WHEN visual->>'typographyId' IN
        ('editorial','traditional','contemporary')
        THEN visual->>'typographyId' ELSE 'editorial' END,
      'headingFontId', CASE WHEN visual->>'headingFontId' IN
        ('georgia','cambria','palatino','times','arial','verdana','trebuchet','system')
        THEN visual->>'headingFontId' ELSE NULL END,
      'bodyFontId', CASE WHEN visual->>'bodyFontId' IN
        ('georgia','cambria','palatino','times','arial','verdana','trebuchet','system')
        THEN visual->>'bodyFontId' ELSE NULL END,
      'displayName', COALESCE(NULLIF(left(trim(source_row.site_name),120),''),'Learning community'),
      'logoAssetId',NULL,'heroAssetId',NULL
    );

    FOR media_key IN SELECT unnest(ARRAY['logoImage','heroImage']) LOOP
      picture:=visual->media_key;
      IF picture IS NULL OR picture='null'::jsonb THEN CONTINUE; END IF;
      image_text:=picture->>'dataUrl';
      IF image_text IS NULL OR image_text !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
        OR length(image_text)>220000 THEN
        RAISE EXCEPTION 'Existing Brand artwork requires manual review: Site %, field %',
          source_row.site_id,media_key;
      END IF;
      image_sha:=encode(digest(picture::text,'sha256'),'hex');
      image_id:=NULL;
      SELECT asset.id INTO image_id FROM site_brand_assets asset
      WHERE asset.site_id=source_row.site_id AND asset.checksum=image_sha LIMIT 1;
      IF image_id IS NULL THEN
        INSERT INTO site_brand_assets(site_id,data_url,checksum,alt_text,rights_confirmed,
          child_image_consent,created_by_person_id)
        VALUES(source_row.site_id,image_text,image_sha,COALESCE(picture->>'altText',''),
          CASE WHEN picture->>'rightsConfirmed'='true' THEN 'true' ELSE 'false' END,
          COALESCE(NULLIF(picture->>'childImageConsent',''),'unconfirmed'),
          source_row.created_by_person_id)
        RETURNING id INTO image_id;
      END IF;
      config:=jsonb_set(config,
        CASE media_key WHEN 'logoImage' THEN ARRAY['logoAssetId']
          ELSE ARRAY['heroAssetId'] END,to_jsonb(image_id::text));
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

  IF EXISTS (
    SELECT 1 FROM site_publications publication
    WHERE publication.status='published'
      AND (publication.brand_version_id IS NULL
        OR publication.website_content_revision IS NULL)
  ) THEN
    RAISE EXCEPTION 'Brand cutover incomplete: some published Sites lack pinned Brand or website content';
  END IF;
END $$;
--> statement-breakpoint
UPDATE site_marketing_packages package
SET brand_version_id=site.current_brand_version_id
FROM sites site
WHERE package.site_id=site.id
  AND package.brand_version_id IS NULL
  AND site.current_brand_version_id IS NOT NULL;
-- Sites with no prior website revisions intentionally keep a NULL current
-- Brand pointer; the first authorized Website & Brand save creates version 1.
-- Do not manufacture an author, provenance or historical design for them.
