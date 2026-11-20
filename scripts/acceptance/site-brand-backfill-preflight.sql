-- READ ONLY. Run before attempting the canonical Brand cutover on any DB.
-- Do not use this script to apply migration 0089 or 0090.
SELECT
  (SELECT count(*) FROM sites) AS total_sites,
  (SELECT count(*) FROM site_publications WHERE status='published') AS published_sites,
  (SELECT count(*) FROM sites site WHERE NOT EXISTS (
    SELECT 1 FROM site_local_content_versions rev
    WHERE rev.site_id=site.id AND jsonb_typeof(rev.content->'branding')='object'
  )) AS sites_without_legacy_brand,
  (SELECT count(*) FROM site_publications publication
   WHERE publication.status='published' AND NOT EXISTS (
     SELECT 1 FROM site_local_content_versions rev
     WHERE rev.site_id=publication.site_id AND rev.status='published'
       AND rev.created_by_person_id IS NOT NULL
   )) AS published_sites_without_attributable_source,
  (SELECT count(*) FROM site_local_content_versions rev
   WHERE rev.status='published' AND jsonb_typeof(rev.content->'branding') IS DISTINCT FROM 'object'
  ) AS published_copy_without_brand_json;

-- A nonempty result is a BLOCKER. Inspect the source and ownership instead
-- of inventing an operator identity or dropping published content.
SELECT publication.site_id, publication.slug,
  (SELECT max(revision) FROM site_local_content_versions rev
   WHERE rev.site_id=publication.site_id AND rev.status='published') AS last_published_revision
FROM site_publications publication
WHERE publication.status='published'
  AND NOT EXISTS (
    SELECT 1 FROM site_local_content_versions rev
    WHERE rev.site_id=publication.site_id
      AND rev.status='published'
      AND rev.created_by_person_id IS NOT NULL
  )
ORDER BY publication.slug;
