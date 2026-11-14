\set ON_ERROR_STOP on

\if :{?publisher_organization_id}
\else
\echo "publisher_organization_id is required"
\quit 3
\endif

-- Opt-in catalog bootstrap for a designated publisher Organization, not a
-- platform migration. The publisher must exist in this canonical database.
SELECT EXISTS (
  SELECT 1 FROM education_v30.organizations
  WHERE id = :'publisher_organization_id'::uuid
) AS publisher_exists
\gset
\if :publisher_exists
\else
\echo "Publisher Organization does not exist in the canonical database"
\quit 3
\endif

BEGIN;
WITH recipes(code,title) AS (VALUES
  ('can.school.starter', 'School Blueprint'),
  ('can.learning-center.starter', 'Community Learning Center Blueprint')
)
INSERT INTO education_v30.blueprints (publisher_organization_id,code,title,status)
SELECT :'publisher_organization_id'::uuid,code,title,'active'
FROM recipes
ON CONFLICT(publisher_organization_id,code) DO NOTHING;

WITH recipes(code) AS (VALUES
  ('can.school.starter'),
  ('can.learning-center.starter')
)
INSERT INTO education_v30.blueprint_versions (
  blueprint_id,version_no,target_kind,spec,lifecycle,published_at
)
SELECT b.id,1,'operation',
  jsonb_build_object('source','can_starter','description',
    'Reusable planning recipe; independent approvals and deployment authority are required'),
  'published',clock_timestamp()
FROM education_v30.blueprints b JOIN recipes r ON r.code=b.code
WHERE b.publisher_organization_id=:'publisher_organization_id'::uuid
ON CONFLICT(blueprint_id,version_no) DO NOTHING;

WITH components(recipe_code,component_key,component_kind,requirement_mode) AS (VALUES
  ('can.school.starter','academic_programs','program_model','required'),
  ('can.school.starter','clubs_and_activities','activity','optional'),
  ('can.school.starter','community','community','optional'),
  ('can.school.starter','experiences','experience','optional'),
  ('can.learning-center.starter','learning_programs','program_model','required'),
  ('can.learning-center.starter','afterschool','program_model','optional'),
  ('can.learning-center.starter','summer_learning','program_model','optional'),
  ('can.learning-center.starter','workforce','program_model','optional'),
  ('can.learning-center.starter','community','community','optional')
)
INSERT INTO education_v30.blueprint_components (
  blueprint_version_id,component_key,component_kind,requirement_mode,component_spec
)
SELECT v.id,c.component_key,c.component_kind,c.requirement_mode,
  jsonb_build_object('planning_only',true)
FROM components c JOIN education_v30.blueprints b
  ON b.code=c.recipe_code
  AND b.publisher_organization_id=:'publisher_organization_id'::uuid
JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id AND v.version_no=1
WHERE v.lifecycle='published' AND b.status='active'
ON CONFLICT(blueprint_version_id,component_key) DO NOTHING;
COMMIT;

-- Reference-library items and Offering adoptions are deliberately not
-- auto-selected. A Site's configuration chooses its own program components.
